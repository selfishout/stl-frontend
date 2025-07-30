import React, { useState } from "react";
import FileUploader from "./components/FileUploader";
import TextFileUploader from "./components/TextFileUploader";
import TextFileViewer from "./components/TextFileViewer";
import TextFileBrowser from "./components/TextFileBrowser";
import Viewer3D from "./components/Viewer3D";

function App() {
  const [activeTab, setActiveTab] = useState("stl");
  const [stlFilename, setStlFilename] = useState(null);
  const [selectedTextFileId, setSelectedTextFileId] = useState(null);
  const [showTextBrowser, setShowTextBrowser] = useState(false);

  const handleStlUploadSuccess = (stlUrl) => {
    const filename = stlUrl.split('/').pop();
    setStlFilename(filename);
  };

  const handleTextUploadSuccess = (data) => {
    // Refresh the text file browser if it's open
    if (showTextBrowser) {
      // This will trigger a re-render of TextFileBrowser
      setShowTextBrowser(false);
      setTimeout(() => setShowTextBrowser(true), 100);
    }
  };

  const handleTextFileSelect = (fileId) => {
    setSelectedTextFileId(fileId);
    setShowTextBrowser(false);
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ width: "300px", padding: "20px", background: "#f8f8f8" }}>
        <h2>STL Dashboard</h2>
        
        {/* Tab Navigation */}
        <div style={{ marginBottom: "20px" }}>
          <button
            onClick={() => setActiveTab("stl")}
            style={{
              background: activeTab === "stl" ? "#007acc" : "#f0f0f0",
              color: activeTab === "stl" ? "white" : "#333",
              border: "none",
              padding: "10px 15px",
              marginRight: "10px",
              borderRadius: "5px",
              cursor: "pointer"
            }}
          >
            STL Files
          </button>
          <button
            onClick={() => setActiveTab("text")}
            style={{
              background: activeTab === "text" ? "#007acc" : "#f0f0f0",
              color: activeTab === "text" ? "white" : "#333",
              border: "none",
              padding: "10px 15px",
              borderRadius: "5px",
              cursor: "pointer"
            }}
          >
            Text Files
          </button>
        </div>

        {/* STL Tab Content */}
        {activeTab === "stl" && (
          <div>
            <h3>Upload STL File</h3>
            <FileUploader onUploadSuccess={handleStlUploadSuccess} />
          </div>
        )}

        {/* Text Tab Content */}
        {activeTab === "text" && (
          <div>
            <h3>Text File Management</h3>
            
            <div style={{ marginBottom: "20px" }}>
              <h4>Upload Text File</h4>
              <TextFileUploader onUploadSuccess={handleTextUploadSuccess} />
            </div>

            <div style={{ marginBottom: "20px" }}>
              <h4>Browse Files</h4>
              <button
                onClick={() => setShowTextBrowser(!showTextBrowser)}
                style={{
                  background: "#28a745",
                  color: "white",
                  border: "none",
                  padding: "8px 15px",
                  borderRadius: "3px",
                  cursor: "pointer",
                  width: "100%"
                }}
              >
                {showTextBrowser ? "Hide File Browser" : "Show File Browser"}
              </button>
            </div>

            {showTextBrowser && (
              <div style={{ 
                border: "1px solid #ddd", 
                borderRadius: "5px", 
                backgroundColor: "white",
                maxHeight: "400px",
                overflow: "hidden"
              }}>
                <TextFileBrowser onFileSelect={handleTextFileSelect} />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main Content Area */}
      <div style={{ flexGrow: 1, padding: "20px" }}>
        {activeTab === "stl" && (
          stlFilename ? <Viewer3D filename={stlFilename} /> : <p>No STL file uploaded yet.</p>
        )}
        
        {activeTab === "text" && (
          selectedTextFileId ? (
            <TextFileViewer 
              fileId={selectedTextFileId} 
              onClose={() => setSelectedTextFileId(null)} 
            />
          ) : (
            <div style={{ 
              display: "flex", 
              alignItems: "center", 
              justifyContent: "center", 
              height: "100%",
              color: "#666"
            }}>
              <p>Select a text file to view its content.</p>
            </div>
          )
        )}
      </div>
    </div>
  );
}

export default App;
