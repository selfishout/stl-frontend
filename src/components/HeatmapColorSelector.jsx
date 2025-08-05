import React from 'react';

const HeatmapColorSelector = ({ selectedColorScheme, onColorSchemeChange }) => {
  const colorSchemes = [
    {
      name: "Blue-Yellow-Red",
      id: "blue-yellow-red",
      description: "Classic heatmap: Blue (low) → Yellow (mid) → Red (high)",
      colors: ["#0000FF", "#FFFF00", "#FF0000"]
    },
    {
      name: "Viridis",
      id: "viridis",
      description: "Scientific colormap: Purple → Blue → Green → Yellow",
      colors: ["#440154", "#31688E", "#35B779", "#FDE725"]
    },
    {
      name: "Plasma",
      id: "plasma",
      description: "High contrast: Dark blue → Purple → Orange → Yellow",
      colors: ["#0D0887", "#7E03A8", "#CC4778", "#F89441"]
    },
    {
      name: "Inferno",
      id: "inferno",
      description: "Fire-like: Black → Red → Orange → Yellow",
      colors: ["#000004", "#56106E", "#BB3754", "#F98C0A"]
    },
    {
      name: "Cool-Warm",
      id: "cool-warm",
      description: "Cool blues to warm reds",
      colors: ["#3B4CC0", "#6B8E23", "#FFD700", "#FF4500"]
    },
    {
      name: "Rainbow",
      id: "rainbow",
      description: "Full spectrum rainbow",
      colors: ["#FF0000", "#FF8000", "#FFFF00", "#80FF00", "#00FF00", "#00FF80", "#00FFFF", "#0080FF", "#0000FF", "#8000FF"]
    },
    {
      name: "Grayscale",
      id: "grayscale",
      description: "Simple black to white",
      colors: ["#000000", "#808080", "#FFFFFF"]
    },
    {
      name: "Green-Red",
      id: "green-red",
      description: "Green (low) to Red (high)",
      colors: ["#00FF00", "#FFFF00", "#FF0000"]
    }
  ];

  return (
    <div style={{ marginBottom: "15px" }}>
      <label style={{ 
        display: "block", 
        fontSize: "14px", 
        fontWeight: "500", 
        color: "#374151", 
        marginBottom: "8px" 
      }}>
        Heatmap Color Scheme:
      </label>
      <div style={{ 
        display: "grid", 
        gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
        gap: "8px" 
      }}>
        {colorSchemes.map((scheme) => (
          <div
            key={scheme.id}
            style={{
              padding: "12px",
              border: selectedColorScheme === scheme.id ? "2px solid #3B82F6" : "1px solid #D1D5DB",
              borderRadius: "8px",
              cursor: "pointer",
              backgroundColor: selectedColorScheme === scheme.id ? "#EFF6FF" : "#FFFFFF",
              transition: "all 0.2s ease",
              boxShadow: selectedColorScheme === scheme.id ? "0 4px 6px rgba(0, 0, 0, 0.1)" : "none"
            }}
            onClick={() => onColorSchemeChange(scheme.id)}
            onMouseEnter={(e) => {
              if (selectedColorScheme !== scheme.id) {
                e.target.style.backgroundColor = "#F9FAFB";
                e.target.style.borderColor = "#9CA3AF";
              }
            }}
            onMouseLeave={(e) => {
              if (selectedColorScheme !== scheme.id) {
                e.target.style.backgroundColor = "#FFFFFF";
                e.target.style.borderColor = "#D1D5DB";
              }
            }}
          >
            <div style={{ marginBottom: "8px" }}>
              <div style={{ 
                height: "16px", 
                borderRadius: "8px", 
                overflow: "hidden",
                display: "flex"
              }}>
                {scheme.colors.map((color, index) => (
                  <div
                    key={index}
                    style={{ 
                      flex: 1, 
                      backgroundColor: color 
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ 
              fontSize: "12px", 
              fontWeight: "500", 
              color: "#111827",
              marginBottom: "4px"
            }}>
              {scheme.name}
            </div>
            <div style={{ 
              fontSize: "11px", 
              color: "#6B7280" 
            }}>
              {scheme.description}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default HeatmapColorSelector; 