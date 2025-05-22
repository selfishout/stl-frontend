import React from "react";
import axios from "axios";

function FileUploader({ onUploadSuccess }) {
  const handleChange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const formData = new FormData();
    formData.append("file", file);

    // const res = await axios.post("http://localhost:8000/upload", formData);   //Localhost
    const res = await axios.post("https://stl-backend-ipt7.onrender.com/uploads", formData);

    onUploadSuccess(res.data.filename);
  };

  return (
    <div>
      <label>Upload .STL File</label><br/>
      <input type="file" accept=".stl" onChange={handleChange} />
    </div>
  );
}

export default FileUploader;
