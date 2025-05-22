import React, { useState } from "react";
import axios from "axios";
import "./UploaderModal.css"; // Add custom styles here

function FileUploader({ onUploadSuccess }) {
  const [showModal, setShowModal] = useState(false);
  const [uploadStatus, setUploadStatus] = useState("uploading"); // uploading | done | error

  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setShowModal(true);
    setUploadStatus("uploading");

    const formData = new FormData();
    formData.append("file", file);

    try {
      // const res = await axios.post("http://localhost:8000/upload", formData); // Replace with Render URL for prod
      const res = await axios.post("https://stl-backend-ipt7.onrender.com/upload", formData);
      setUploadStatus("done");
      onUploadSuccess(res.data.filename);

      // Hide modal after 2 seconds
      setTimeout(() => setShowModal(false), 2000);
    } catch (err) {
      console.error("Upload failed", err);
      setUploadStatus("error");
    }
  };

  return (
    <>
      <input type="file" onChange={handleChange} />

      {showModal && (
        <div className="modal-overlay">
          <div className="modal-content">
            {uploadStatus === "uploading" && (
              <>
                <div className="spinner" />
                <p>Uploading STL file...</p>
              </>
            )}
            {uploadStatus === "done" && <p className="done-msg">✅ File uploaded!</p>}
            {uploadStatus === "error" && <p className="error-msg">❌ Upload failed.</p>}
          </div>
        </div>
      )}
    </>
  );
}

export default FileUploader;
