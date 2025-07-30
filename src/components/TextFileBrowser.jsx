import React, { useState, useEffect } from "react";
import axios from "axios";
import { getApiUrl } from "../config";

function TextFileBrowser({ onFileSelect }) {
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      setLoading(true);
      const response = await axios.get(getApiUrl("/text_files/"));
      setFiles(response.data);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch files:", err);
      setError("Failed to load files");
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (fileId) => {
    if (!window.confirm("Are you sure you want to delete this file?")) {
      return;
    }

    try {
      await axios.delete(getApiUrl(`/text_files/${fileId}`));
      // Refresh the file list
      fetchFiles();
    } catch (err) {
      console.error("Failed to delete file:", err);
      alert("Failed to delete file");
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleString();
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <div className="spinner" />
        <p>Loading files...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "red" }}>
        <p>{error}</p>
        <button onClick={fetchFiles}>Retry</button>
      </div>
    );
  }

  return (
    <div style={{ padding: "20px" }}>
      <h3 style={{ marginBottom: "20px" }}>Uploaded Text Files</h3>
      
      {files.length === 0 ? (
        <p style={{ textAlign: "center", color: "#666" }}>No text files uploaded yet.</p>
      ) : (
        <div style={{ maxHeight: "400px", overflowY: "auto" }}>
          {files.map((file) => (
            <div
              key={file.id}
              style={{
                border: "1px solid #ddd",
                borderRadius: "5px",
                padding: "15px",
                marginBottom: "10px",
                backgroundColor: "#f9f9f9",
                cursor: "pointer",
                transition: "background-color 0.2s"
              }}
              onMouseEnter={(e) => e.target.style.backgroundColor = "#f0f0f0"}
              onMouseLeave={(e) => e.target.style.backgroundColor = "#f9f9f9"}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ flex: 1 }}>
                  <h4 style={{ margin: "0 0 5px 0", color: "#333" }}>
                    {file.original_filename}
                  </h4>
                  <div style={{ fontSize: "12px", color: "#666" }}>
                    <span>Size: {formatFileSize(file.file_size)}</span>
                    <span style={{ marginLeft: "15px" }}>
                      Uploaded: {formatDate(file.upload_date)}
                    </span>
                  </div>
                </div>
                
                <div style={{ display: "flex", gap: "10px" }}>
                  <button
                    onClick={() => onFileSelect(file.id)}
                    style={{
                      background: "#007acc",
                      color: "white",
                      border: "none",
                      padding: "5px 15px",
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    View
                  </button>
                  <button
                    onClick={() => handleDelete(file.id)}
                    style={{
                      background: "#dc3545",
                      color: "white",
                      border: "none",
                      padding: "5px 15px",
                      borderRadius: "3px",
                      cursor: "pointer",
                      fontSize: "12px"
                    }}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default TextFileBrowser; 