import React, { useState, useEffect } from "react";
import axios from "axios";
import { getApiUrl } from "../config";

function TextFileViewer({ fileId, onClose }) {
  const [content, setContent] = useState("");
  const [filename, setFilename] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (fileId) {
      fetchFileContent();
    }
  }, [fileId]);

  const fetchFileContent = async () => {
    try {
      setLoading(true);
      const response = await axios.get(getApiUrl(`/text_files/${fileId}/content`));
      setContent(response.data.content);
      setFilename(response.data.filename);
      setError(null);
    } catch (err) {
      console.error("Failed to fetch file content:", err);
      setError("Failed to load file content");
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: "20px", textAlign: "center" }}>
        <div className="spinner" />
        <p>Loading file content...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: "20px", textAlign: "center", color: "red" }}>
        <p>{error}</p>
        <button onClick={onClose}>Close</button>
      </div>
    );
  }

  return (
    <div style={{ 
      height: "100%", 
      display: "flex", 
      flexDirection: "column",
      backgroundColor: "#1e1e1e",
      color: "#d4d4d4"
    }}>
      <div style={{ 
        padding: "10px 20px", 
        borderBottom: "1px solid #333",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center"
      }}>
        <h3 style={{ margin: 0, color: "#fff" }}>{filename}</h3>
        <button 
          onClick={onClose}
          style={{
            background: "#007acc",
            color: "white",
            border: "none",
            padding: "5px 15px",
            borderRadius: "3px",
            cursor: "pointer"
          }}
        >
          Close
        </button>
      </div>
      
      <div style={{ 
        flex: 1, 
        overflow: "auto", 
        padding: "20px",
        fontFamily: "Consolas, 'Courier New', monospace",
        fontSize: "14px",
        lineHeight: "1.5"
      }}>
        <pre style={{ 
          margin: 0, 
          whiteSpace: "pre-wrap",
          wordWrap: "break-word"
        }}>
          {content}
        </pre>
      </div>
    </div>
  );
}

export default TextFileViewer; 