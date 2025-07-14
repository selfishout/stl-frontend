// Environment configuration - change this one variable to switch between environments
const USE_RENDER = false; // Set to true for Render, false for localhost

// Base URLs for different environments
const LOCAL_BASE_URL = 'http://localhost:8000';
const RENDER_BASE_URL = 'https://stl-backend-ipt7.onrender.com'; // Your actual Render backend URL

// Export the active configuration
export const config = {
  baseURL: USE_RENDER ? RENDER_BASE_URL : LOCAL_BASE_URL,
  isProduction: USE_RENDER,
  environment: USE_RENDER ? 'production' : 'development'
};

// Helper function to get full API URL
export function getApiUrl(path) {
  return `https://stl-backend-ipt7.onrender.com${path}`;
}

// Common API endpoints
export const API_ENDPOINTS = {
  upload: '/upload_stl/',
  health: '/health',
  docs: '/docs'
}; 