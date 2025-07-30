import React, { useState } from "react";
import axios from "axios";
import "./UploaderModal.css";
import { getApiUrl } from "../config";

function TextFileUploader({ onUploadSuccess }) {
  const [showModal, setShowModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("uploading");

  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    // Validate file type
    if (!file.name.toLowerCase().endsWith('.txt')) {
      alert('Please select a .txt file');
      return;
    }

    setShowModal(true);
    setUploadStatus("uploading");

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await axios.post(getApiUrl("/upload_text/"), formData);
      setUploadStatus("done");
      onUploadSuccess(res.data);

      // Hide modal after 2 seconds
      setTimeout(() => setShowModal(false), 2000);
    } catch (err) {
      console.error("Upload failed", err);
      setUploadStatus("error");
    }
  };

  return (
    <>
      <input 
        type="file" 
        onChange={handleChange} 
        accept=".txt"
        style={{ marginBottom: "10px" }}
      />

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            {uploadStatus === "uploading" && (
              <>
                <div className="spinner" />
                <p>Uploading text file...</p>
              </>
            )}
            {uploadStatus === "done" && <p className="done-msg">✅ Text file uploaded!</p>}
            {uploadStatus === "error" && <p className="error-msg">❌ Upload failed.</p>}
          </div>
        </div>
      )}
    </>
  );
}

export default TextFileUploader; 