import React, { useState } from "react";
import FileUploader from "./components/FileUploader";
import Viewer3D from "./components/Viewer3D";

function App() {
  const [filename, setFilename] = useState(null);

  return (
    <div style={{ display: "flex", minHeight: "100vh", fontFamily: "sans-serif" }}>
      <div style={{ width: "250px", padding: "20px", background: "#f8f8f8" }}>
        <h2>STL Dashboard</h2>
        <FileUploader onUploadSuccess={setFilename} />
      </div>
      <div style={{ flexGrow: 1, padding: "20px" }}>
        {filename ? <Viewer3D filename={filename} /> : <p>No file uploaded yet.</p>}
      </div>
    </div>
  );
}

export default App;
