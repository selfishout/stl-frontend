// Color interpolation utilities for heatmap generation

// Color schemes with their color stops
export const colorSchemes = {
  "blue-yellow-red": [
    { t: 0, r: 0, g: 0, b: 255 },    // Blue
    { t: 0.5, r: 255, g: 255, b: 0 }, // Yellow
    { t: 1, r: 255, g: 0, b: 0 }      // Red
  ],
  "viridis": [
    { t: 0, r: 68, g: 1, b: 84 },     // Purple
    { t: 0.33, r: 49, g: 104, b: 142 }, // Blue
    { t: 0.66, r: 53, g: 183, b: 121 }, // Green
    { t: 1, r: 253, g: 231, b: 37 }   // Yellow
  ],
  "plasma": [
    { t: 0, r: 13, g: 8, b: 135 },    // Dark blue
    { t: 0.33, r: 126, g: 3, b: 168 }, // Purple
    { t: 0.66, r: 204, g: 71, b: 120 }, // Orange-red
    { t: 1, r: 249, g: 148, b: 65 }   // Yellow
  ],
  "inferno": [
    { t: 0, r: 0, g: 0, b: 4 },       // Black
    { t: 0.33, r: 86, g: 16, b: 110 }, // Purple
    { t: 0.66, r: 187, g: 55, b: 84 }, // Red-orange
    { t: 1, r: 249, g: 140, b: 10 }   // Yellow
  ],
  "cool-warm": [
    { t: 0, r: 59, g: 76, b: 192 },   // Cool blue
    { t: 0.33, r: 107, g: 142, b: 35 }, // Green
    { t: 0.66, r: 255, g: 215, b: 0 }, // Yellow
    { t: 1, r: 255, g: 69, b: 0 }     // Warm red
  ],
  "rainbow": [
    { t: 0, r: 255, g: 0, b: 0 },     // Red
    { t: 0.1, r: 255, g: 128, b: 0 }, // Orange
    { t: 0.2, r: 255, g: 255, b: 0 }, // Yellow
    { t: 0.3, r: 128, g: 255, b: 0 }, // Light green
    { t: 0.4, r: 0, g: 255, b: 0 },   // Green
    { t: 0.5, r: 0, g: 255, b: 128 }, // Light blue-green
    { t: 0.6, r: 0, g: 255, b: 255 }, // Cyan
    { t: 0.7, r: 0, g: 128, b: 255 }, // Light blue
    { t: 0.8, r: 0, g: 0, b: 255 },   // Blue
    { t: 1, r: 128, g: 0, b: 255 }    // Purple
  ],
  "grayscale": [
    { t: 0, r: 0, g: 0, b: 0 },       // Black
    { t: 0.5, r: 128, g: 128, b: 128 }, // Gray
    { t: 1, r: 255, g: 255, b: 255 }  // White
  ],
  "green-red": [
    { t: 0, r: 0, g: 255, b: 0 },     // Green
    { t: 0.5, r: 255, g: 255, b: 0 }, // Yellow
    { t: 1, r: 255, g: 0, b: 0 }      // Red
  ]
};

// Interpolate between two colors
function interpolateColor(color1, color2, t) {
  return {
    r: Math.round(color1.r + (color2.r - color1.r) * t),
    g: Math.round(color1.g + (color2.g - color1.g) * t),
    b: Math.round(color1.b + (color2.b - color1.b) * t)
  };
}

// Get color for a given value using the specified color scheme
export function getColorForValue(value, colorScheme = "blue-yellow-red") {
  const scheme = colorSchemes[colorScheme];
  if (!scheme) {
    return getColorForValue(value, "blue-yellow-red");
  }

  // Clamp value to [0, 1]
  const t = Math.max(0, Math.min(1, value));

  // Find the two color stops to interpolate between
  let startColor, endColor;
  let startT, endT;

  for (let i = 0; i < scheme.length - 1; i++) {
    if (t >= scheme[i].t && t <= scheme[i + 1].t) {
      startColor = scheme[i];
      endColor = scheme[i + 1];
      startT = scheme[i].t;
      endT = scheme[i + 1].t;
      break;
    }
  }

  // If we're at the boundaries
  if (t <= scheme[0].t) {
    return { r: scheme[0].r, g: scheme[0].g, b: scheme[0].b };
  }
  if (t >= scheme[scheme.length - 1].t) {
    return { r: scheme[scheme.length - 1].r, g: scheme[scheme.length - 1].g, b: scheme[scheme.length - 1].b };
  }

  // Interpolate between the two colors
  const localT = (t - startT) / (endT - startT);
  return interpolateColor(startColor, endColor, localT);
}

// Convert RGB values to hex string
export function rgbToHex(r, g, b) {
  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

// Convert hex string to RGB values
export function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
} 