const { v2: cloudinary } = require('cloudinary');

// Configure from CLOUDINARY_URL if present, otherwise use individual env vars
if (process.env.CLOUDINARY_URL) {
  // cloudinary will auto-configure from CLOUDINARY_URL
} else {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME || process.env.CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY || process.env.CLOUDINARY_KEY || process.env.API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET || process.env.CLOUDINARY_SECRET || process.env.API_SECRET,
  });
}

module.exports = cloudinary;
