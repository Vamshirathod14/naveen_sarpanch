const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
require('dotenv').config();
const multer = require('multer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

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
   ✅ MULTER CONFIGURATION (LOCAL STORAGE)
   ======================= */
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadDir = 'uploads/complaints';
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: function (req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname).toLowerCase();
    cb(null, 'image-' + uniqueSuffix + ext);
  }
});

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 50 * 1024 * 1024, // 50MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // ACCEPT ALL IMAGE TYPES
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/webp', 'image/heic', 'image/heif', 'image/avif',
      'image/tiff', 'image/bmp', 'image/svg+xml'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      console.log('✅ Accepting file:', file.originalname);
      cb(null, true);
    } else {
      // Also check by extension
      const ext = path.extname(file.originalname).toLowerCase();
      const allowedExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.webp', 
                                '.heic', '.heif', '.avif', '.tiff', '.tif', 
                                '.bmp', '.svg'];
      
      if (allowedExtensions.includes(ext)) {
        console.log('✅ Accepting file by extension:', file.originalname);
        cb(null, true);
      } else {
        console.log('❌ Rejecting file:', file.originalname);
        cb(new Error('Invalid file type. Only images are allowed.'));
      }
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
  imageBefore: String, // Local path
  imageAfter: String,  // Local path
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
});

/* =======================
   ✅ SERVE UPLOADED FILES
   ======================= */
app.use('/uploads', express.static('uploads'));

/* =======================
   ✅ HEALTH CHECK
   ======================= */
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Naveen Seva Mitra Backend Running!',
    status: 'active',
    storage: 'local',
    database: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
    endpoints: {
      complaints: '/api/complaints',
      'complaints-with-image': '/api/complaints-with-image',
      activities: '/api/activities',
      'complaints-with-images': '/api/complaints-with-images',
      'complaints-stats': '/api/complaints-stats',
      'test-upload': '/api/test-upload'
    }
  });
});

/* =======================
   ✅ ACTIVITY ROUTES (FOR ADMIN PANEL)
   ======================= */

// ✅ Get all activities
app.get('/api/activities', async (req, res) => {
  try {
    const activities = await Activity.find().sort({ date: -1 });
    res.json(activities);
  } catch (error) {
    console.error('❌ Get activities error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ✅ Create new activity
app.post('/api/activities', async (req, res) => {
  try {
    console.log('📝 Creating activity:', req.body);
    
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const activity = new Activity({
      title,
      description,
      date: new Date()
    });

    const savedActivity = await activity.save();
    console.log('✅ Activity saved:', savedActivity._id);
    res.status(201).json(savedActivity);
  } catch (error) {
    console.error('❌ Create activity error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ✅ Update activity
app.put('/api/activities/:id', async (req, res) => {
  try {
    console.log('📝 Updating activity:', req.params.id, req.body);
    
    const { title, description } = req.body;

    if (!title || !description) {
      return res.status(400).json({ message: 'Title and description are required' });
    }

    const updatedActivity = await Activity.findByIdAndUpdate(
      req.params.id,
      { title, description },
      { new: true }
    );

    if (!updatedActivity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    console.log('✅ Activity updated:', updatedActivity._id);
    res.json(updatedActivity);
  } catch (error) {
    console.error('❌ Update activity error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ✅ Delete activity
app.delete('/api/activities/:id', async (req, res) => {
  try {
    console.log('🗑️ Deleting activity:', req.params.id);
    
    const deletedActivity = await Activity.findByIdAndDelete(req.params.id);

    if (!deletedActivity) {
      return res.status(404).json({ message: 'Activity not found' });
    }

    console.log('✅ Activity deleted:', req.params.id);
    res.json({ message: 'Activity deleted successfully' });
  } catch (error) {
    console.error('❌ Delete activity error:', error);
    res.status(500).json({ message: error.message });
  }
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
    console.log('Body fields:', req.body);
    console.log('File:', req.file ? {
      originalname: req.file.originalname,
      mimetype: req.file.mimetype,
      size: req.file.size,
      filename: req.file.filename
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

    const complaint = new Complaint({
      phoneNumber,
      category,
      description,
      location: location || '',
      status: status || 'pending',
      imageBefore: `/uploads/complaints/${req.file.filename}`,
      imageType: req.file.mimetype,
      fileSize: req.file.size,
    });

    const savedComplaint = await complaint.save();
    console.log('✅ Complaint with image saved:', savedComplaint._id);
    
    res.status(201).json(savedComplaint);
  } catch (error) {
    console.error('❌ Complaint with image error:', error);
    res.status(500).json({ 
      message: 'Failed to upload image',
      error: error.message
    });
  }
});

// ✅ Upload before image (Admin Panel)
app.post('/api/complaints/:id/upload-before', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    console.log('📸 Admin uploading BEFORE image for complaint:', req.params.id);
    console.log('File:', req.file ? {
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

    // Delete old image if exists
    if (complaint.imageBefore) {
      const oldImagePath = path.join(__dirname, complaint.imageBefore);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    // Update complaint
    complaint.imageBefore = `/uploads/complaints/${req.file.filename}`;
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
    console.log('File:', req.file ? {
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

    // Delete old image if exists
    if (complaint.imageAfter) {
      const oldImagePath = path.join(__dirname, complaint.imageAfter);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    // Update complaint
    complaint.imageAfter = `/uploads/complaints/${req.file.filename}`;
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
        size: req.file.size,
        filename: req.file.filename,
        path: `/uploads/complaints/${req.file.filename}`
      }
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
  console.log(`📁 Local storage: Enabled`);
  console.log(`🗄️  Database: ${mongoose.connection.readyState === 1 ? 'Connected' : 'Disconnected'}`);
  console.log(`📊 Endpoints:`);
  console.log(`   - GET /api/activities`);
  console.log(`   - POST /api/activities`);
  console.log(`   - PUT /api/activities/:id`);
  console.log(`   - DELETE /api/activities/:id`);
  console.log(`   - GET /api/complaints`);
  console.log(`   - POST /api/complaints-with-image`);
});