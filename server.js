const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const multer = require('multer');
const cloudinary = require('cloudinary').v2;
const streamifier = require('streamifier');

const app = express();
const PORT = process.env.PORT || 5000;

/* =======================
   ✅ CLOUDINARY CONFIG
   ======================= */
console.log('🔧 Checking Cloudinary configuration...');
console.log('Cloud Name:', process.env.CLOUDINARY_CLOUD_NAME ? '✅ Set' : '❌ Missing');
console.log('API Key:', process.env.CLOUDINARY_API_KEY ? '✅ Set' : '❌ Missing');
console.log('API Secret:', process.env.CLOUDINARY_API_SECRET ? '✅ Set' : '❌ Missing');

try {
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
    secure: true
  });
  console.log('✅ Cloudinary configured successfully');
} catch (error) {
  console.error('❌ Cloudinary configuration error:', error.message);
}

/* =======================
   ✅ MIDDLEWARE
   ======================= */
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'Accept']
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/* =======================
   ✅ MULTER MEMORY STORAGE
   ======================= */
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB limit for high-quality photos
    files: 1
  },
  fileFilter: (req, file, cb) => {
    console.log('📁 File upload attempt:', {
      originalname: file.originalname,
      mimetype: file.mimetype,
      size: file.size
    });

    // ACCEPT ALL IMAGE TYPES including iPhone HEIC
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/webp', 'image/heic', 'image/heif', 'image/avif',
      'image/tiff', 'image/bmp', 'image/svg+xml'
    ];
    
    // Also check by extension for files without proper MIME type
    const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', 
                              '.heic', '.heif', '.avif', '.tiff', '.tif', 
                              '.bmp', '.svg'];
    
    const fileExt = file.originalname.toLowerCase().slice(file.originalname.lastIndexOf('.'));
    
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExt)) {
      console.log('✅ Accepting file:', file.originalname);
      cb(null, true);
    } else {
      console.log('❌ Rejecting file:', file.originalname, 'MIME:', file.mimetype, 'Ext:', fileExt);
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  }
});

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    console.error('❌ Multer Error:', err.code, err.message);
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        message: 'File size is too large. Maximum size is 50MB.' 
      });
    }
    return res.status(400).json({ message: err.message });
  } else if (err) {
    console.error('❌ Upload Error:', err.message);
    return res.status(400).json({ message: err.message });
  }
  next();
};

/* =======================
   ✅ CLOUDINARY UPLOAD FUNCTION
   ======================= */
const uploadToCloudinary = (fileBuffer, fileName, folder = 'sarpanch-complaints') => {
  return new Promise((resolve, reject) => {
    console.log('☁️ Uploading to Cloudinary:', {
      fileName: fileName,
      folder: folder,
      bufferSize: fileBuffer.length
    });

    // Generate unique filename
    const uniqueFileName = `${folder}/${Date.now()}_${Math.random().toString(36).substring(7)}`;
    
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: uniqueFileName,
        resource_type: 'auto', // Auto-detect image type
        allowed_formats: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic', 'heif', 'avif', 'tiff', 'bmp', 'svg'],
        transformation: [
          { quality: 'auto', fetch_format: 'auto' },
          { width: 1920, crop: 'limit' } // Limit max width
        ],
        timeout: 60000 // 60 seconds timeout
      },
      (error, result) => {
        if (error) {
          console.error('❌ Cloudinary upload error:', error.message);
          reject(new Error(`Cloudinary upload failed: ${error.message}`));
        } else {
          console.log('✅ Cloudinary upload successful:', {
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            bytes: result.bytes
          });
          resolve(result);
        }
      }
    );

    streamifier.createReadStream(fileBuffer).pipe(uploadStream);
  });
};

/* =======================
   ✅ SCHEMAS & MODELS
   ======================= */
const activitySchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String, required: true },
  date: { type: Date, default: Date.now }
});

const complaintSchema = new mongoose.Schema({
  phoneNumber: { type: String, required: true },
  category: { type: String, required: true },
  description: { type: String, required: true },
  location: { type: String, default: '' },
  status: {
    type: String,
    enum: ['pending', 'in-progress', 'completed'],
    default: 'pending'
  },
  imageBefore: String, // Cloudinary URL
  imageAfter: String,  // Cloudinary URL
  cloudinaryIdBefore: String, // Store Cloudinary public_id
  cloudinaryIdAfter: String,  // Store Cloudinary public_id
  imageType: { type: String, default: 'image/jpeg' },
  fileSize: Number,
  resolvedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

const Activity = mongoose.model('Activity', activitySchema);
const Complaint = mongoose.model('Complaint', complaintSchema);

/* =======================
   ✅ MONGODB CONNECTION
   ======================= */
mongoose.connect(process.env.MONGODB_URI, {
  serverSelectionTimeoutMS: 10000,
  socketTimeoutMS: 45000,
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => {
  console.error('❌ MongoDB Error:', err.message);
  console.log('⚠️ Server will continue but database operations will fail');
});

/* =======================
   ✅ HEALTH CHECK
   ======================= */
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Naveen Seva Mitra Backend Running with Cloudinary!',
    status: 'active',
    cloudinary: process.env.CLOUDINARY_CLOUD_NAME ? 'configured' : 'not configured',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    endpoints: {
      complaints: '/api/complaints',
      'complaints-with-image': '/api/complaints-with-image',
      activities: '/api/activities',
      'complaints-with-images': '/api/complaints-with-images',
      'complaints-stats': '/api/complaints-stats'
    }
  });
});

/* =======================
   ✅ COMPLAINT ROUTES
   ======================= */

// ✅ Create complaint WITHOUT image
app.post('/api/complaints', async (req, res) => {
  try {
    console.log('📝 Creating complaint without image:', req.body);
    
    const { phoneNumber, category, description, location, status } = req.body;

    if (!phoneNumber || !category || !description) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const complaint = new Complaint({
      phoneNumber,
      category,
      description,
      location: location || '',
      status: status || 'pending',
    });

    const savedComplaint = await complaint.save();
    console.log('✅ Complaint saved:', savedComplaint._id);
    res.status(201).json(savedComplaint);
  } catch (error) {
    console.error('❌ Complaint Error:', error);
    res.status(500).json({ message: 'Server error: ' + error.message });
  }
});

// ✅ Create complaint WITH image (Flutter app upload)
app.post('/api/complaints-with-image', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    console.log('📸 Creating complaint with image...');
    console.log('Request body fields:', req.body);
    console.log('File info:', req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');
    
    const { phoneNumber, category, description, location, status } = req.body;

    if (!phoneNumber || !category || !description) {
      return res.status(400).json({ 
        message: 'Missing required fields: phoneNumber, category, description' 
      });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded' });
    }

    // Upload to Cloudinary
    const fileName = req.file.originalname;
    const cloudinaryResult = await uploadToCloudinary(
      req.file.buffer, 
      fileName,
      'sarpanch-complaints/before'
    );

    console.log('✅ Cloudinary upload successful');

    const complaint = new Complaint({
      phoneNumber,
      category,
      description,
      location: location || '',
      status: status || 'pending',
      imageBefore: cloudinaryResult.secure_url,
      cloudinaryIdBefore: cloudinaryResult.public_id,
      imageType: req.file.mimetype,
      fileSize: req.file.size,
    });

    const savedComplaint = await complaint.save();
    console.log('✅ Complaint with image saved:', savedComplaint._id);
    
    res.status(201).json(savedComplaint);
  } catch (error) {
    console.error('❌ Complaint with image error:', error);
    res.status(500).json({ 
      message: 'Failed to upload image to Cloudinary',
      error: error.message
    });
  }
});

// ✅ Upload before image (Admin Panel)
app.post('/api/complaints/:id/upload-before', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    console.log('📸 Admin uploading BEFORE image for complaint:', req.params.id);
    console.log('File info:', req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');

    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    // Upload to Cloudinary
    const fileName = `before_${Date.now()}_${complaint._id}`;
    const cloudinaryResult = await uploadToCloudinary(
      req.file.buffer, 
      fileName,
      'sarpanch-complaints/before'
    );

    // Update complaint
    complaint.imageBefore = cloudinaryResult.secure_url;
    complaint.cloudinaryIdBefore = cloudinaryResult.public_id;
    complaint.imageType = req.file.mimetype;
    complaint.fileSize = req.file.size;
    
    const updatedComplaint = await complaint.save();
    
    console.log('✅ Before image uploaded successfully for complaint:', complaint._id);
    res.json(updatedComplaint);
  } catch (error) {
    console.error('❌ Before image upload error:', error);
    res.status(500).json({ 
      message: 'Failed to upload before image',
      error: error.message
    });
  }
});

// ✅ Upload after image (Admin Panel)
app.post('/api/complaints/:id/upload-after', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    console.log('📸 Admin uploading AFTER image for complaint:', req.params.id);
    console.log('File info:', req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size
    } : 'No file');

    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded' });
    }

    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    // Upload to Cloudinary
    const fileName = `after_${Date.now()}_${complaint._id}`;
    const cloudinaryResult = await uploadToCloudinary(
      req.file.buffer, 
      fileName,
      'sarpanch-complaints/after'
    );

    // Update complaint
    complaint.imageAfter = cloudinaryResult.secure_url;
    complaint.cloudinaryIdAfter = cloudinaryResult.public_id;
    complaint.status = 'completed';
    complaint.resolvedAt = new Date();
    complaint.imageType = req.file.mimetype;
    complaint.fileSize = req.file.size;
    
    const updatedComplaint = await complaint.save();
    
    console.log('✅ After image uploaded successfully for complaint:', complaint._id);
    res.json(updatedComplaint);
  } catch (error) {
    console.error('❌ After image upload error:', error);
    res.status(500).json({ 
      message: 'Failed to upload after image',
      error: error.message
    });
  }
});

// ✅ Get all complaints
app.get('/api/complaints', async (req, res) => {
  try {
    const complaints = await Complaint.find().sort({ createdAt: -1 });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Get complaints by phone number
app.get('/api/complaints/phone/:phoneNumber', async (req, res) => {
  try {
    const complaints = await Complaint.find({ phoneNumber: req.params.phoneNumber });
    res.json(complaints);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Get complaints with images
app.get('/api/complaints-with-images', async (req, res) => {
  try {
    const complaints = await Complaint.find({
      $or: [
        { imageBefore: { $ne: null } },
        { imageAfter: { $ne: null } }
      ]
    })
    .sort({ createdAt: -1 })
    .limit(50);
    
    res.json(complaints);
  } catch (error) {
    console.error('❌ Complaints with images error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ✅ Get complaints statistics
app.get('/api/complaints-stats', async (req, res) => {
  try {
    const totalComplaints = await Complaint.countDocuments();
    const pendingComplaints = await Complaint.countDocuments({ status: 'pending' });
    const inProgressComplaints = await Complaint.countDocuments({ status: 'in-progress' });
    const completedComplaints = await Complaint.countDocuments({ status: 'completed' });
    const complaintsWithImages = await Complaint.countDocuments({
      $or: [
        { imageBefore: { $ne: null } },
        { imageAfter: { $ne: null } }
      ]
    });

    res.json({
      total: totalComplaints,
      pending: pendingComplaints,
      inProgress: inProgressComplaints,
      completed: completedComplaints,
      withImages: complaintsWithImages
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ Update complaint status
app.put('/api/complaints/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    const updateData = { status };
    if (status === 'completed') {
      updateData.resolvedAt = new Date();
    }

    const updatedComplaint = await Complaint.findByIdAndUpdate(
      req.params.id,
      updateData,
      { new: true }
    );

    if (!updatedComplaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    res.json(updatedComplaint);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

/* =======================
   ✅ ACTIVITY ROUTES
   ======================= */
app.get('/api/activities', async (req, res) => {
  try {
    const activities = await Activity.find().sort({ date: -1 });
    res.json(activities);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

app.post('/api/activities', async (req, res) => {
  try {
    const activity = new Activity(req.body);
    const savedActivity = await activity.save();
    res.status(201).json(savedActivity);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.put('/api/activities/:id', async (req, res) => {
  try {
    const updatedActivity = await Activity.findByIdAndUpdate(
      req.params.id,
      req.body,
      { new: true }
    );
    res.json(updatedActivity);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
});

app.delete('/api/activities/:id', async (req, res) => {
  try {
    await Activity.findByIdAndDelete(req.params.id);
    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/* =======================
   ✅ TEST ENDPOINT for debugging
   ======================= */
app.post('/api/test-upload', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    console.log('🧪 Test upload endpoint called');
    if (!req.file) {
      return res.status(400).json({ message: 'No file uploaded' });
    }
    
    res.json({
      message: 'Upload successful',
      file: {
        originalname: req.file.originalname,
        mimetype: req.file.mimetype,
        size: req.file.size
      },
      cloudinaryConfigured: !!process.env.CLOUDINARY_CLOUD_NAME
    });
  } catch (error) {
    console.error('Test upload error:', error);
    res.status(500).json({ message: error.message });
  }
});

/* =======================
   ✅ 404 & ERROR HANDLERS
   ======================= */
app.use((req, res) => {
  console.log(`❌ 404: ${req.method} ${req.originalUrl}`);
  res.status(404).json({ 
    message: `Route ${req.originalUrl} not found`,
    method: req.method
  });
});

app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({ 
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'production' ? undefined : err.message
  });
});

/* =======================
   ✅ START SERVER
   ======================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📝 API available at: http://localhost:${PORT}/api`);
  console.log(`☁️  Cloudinary: ${process.env.CLOUDINARY_CLOUD_NAME ? 'Configured' : 'NOT CONFIGURED'}`);
  console.log(`🗄️  Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
});