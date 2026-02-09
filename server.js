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
   ✅ MIDDLEWARE (FIXED)
   ======================= */
app.use(cors({
  origin: '*'
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/* =======================
   ✅ MULTER CONFIGURATION (ACCEPT ALL IMAGES)
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
    const originalName = path.parse(file.originalname).name;
    const extension = path.extname(file.originalname).toLowerCase();
    cb(null, 'image-' + uniqueSuffix + extension);
  }
});

const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 20 * 1024 * 1024, // 20MB limit for high-quality iPhone photos
    files: 1
  },
  fileFilter: (req, file, cb) => {
    // Accept all image types including HEIC from iPhone
    const allowedMimes = [
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/gif',
      'image/webp',
      'image/heic',
      'image/heif',
      'image/avif',
      'image/tiff',
      'image/bmp',
      'image/svg+xml'
    ];
    
    // Also check by file extension
    const allowedExtensions = [
      '.jpg', '.jpeg', '.png', '.gif', '.webp', 
      '.heic', '.heif', '.avif', '.tiff', '.tif', 
      '.bmp', '.svg'
    ];
    
    const fileExtension = path.extname(file.originalname).toLowerCase();
    
    if (allowedMimes.includes(file.mimetype) || allowedExtensions.includes(fileExtension)) {
      console.log(`✅ Accepting file: ${file.originalname}, MIME: ${file.mimetype}, Extension: ${fileExtension}`);
      return cb(null, true);
    } else {
      console.log(`❌ Rejecting file: ${file.originalname}, MIME: ${file.mimetype}, Extension: ${fileExtension}`);
      return cb(new Error(`File type not allowed. Please upload an image file.`));
    }
  }
});

// Error handling for multer
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        message: 'File size is too large. Maximum size is 20MB.' 
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({ 
        message: 'Too many files. Maximum 1 file allowed.' 
      });
    }
    return res.status(400).json({ message: err.message });
  } else if (err) {
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
  imageBefore: String,
  imageAfter: String,
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
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

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
    endpoints: {
      complaints: '/api/complaints',
      'complaints-with-image': '/api/complaints-with-image',
      activities: '/api/activities',
      uploads: '/uploads'
    }
  });
});

/* =======================
   ✅ COMPLAINT ROUTES
   ======================= */

// ✅ Create complaint WITHOUT image (for regular submission)
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

// ✅ Create complaint WITH image (for Flutter app with image upload)
app.post('/api/complaints-with-image', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    console.log('📸 Creating complaint with image...');
    console.log('📁 File info:', {
      filename: req.file?.filename,
      originalname: req.file?.originalname,
      mimetype: req.file?.mimetype,
      size: req.file?.size,
      path: req.file?.path
    });
    console.log('📝 Body fields:', req.body);
    
    const { phoneNumber, category, description, location, status } = req.body;

    if (!phoneNumber || !category || !description) {
      // Delete uploaded file if validation fails
      if (req.file) {
        fs.unlinkSync(req.file.path);
      }
      return res.status(400).json({ message: 'Missing required fields: phoneNumber, category, description' });
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
    console.log('✅ Complaint with image saved:', {
      id: savedComplaint._id,
      image: savedComplaint.imageBefore,
      type: savedComplaint.imageType,
      size: savedComplaint.fileSize
    });
    res.status(201).json(savedComplaint);
  } catch (error) {
    console.error('❌ Complaint with image error:', error);
    
    // Delete uploaded file if save fails
    if (req.file) {
      fs.unlinkSync(req.file.path);
    }
    
    res.status(500).json({ 
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Get all complaints (for admin panel)
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

// ✅ Get complaints with images (for before/after gallery)
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

// ✅ Get all complaints statistics (for analytics)
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

// ✅ Upload before image (admin panel)
app.post('/api/complaints/:id/upload-before', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded' });
    }

    // Delete old image if exists
    if (complaint.imageBefore) {
      const oldImagePath = path.join(__dirname, complaint.imageBefore);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    complaint.imageBefore = `/uploads/complaints/${req.file.filename}`;
    complaint.imageType = req.file.mimetype;
    complaint.fileSize = req.file.size;
    
    const updatedComplaint = await complaint.save();
    
    res.json(updatedComplaint);
  } catch (error) {
    console.error('❌ Before image upload error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ✅ Upload after image (admin panel)
app.post('/api/complaints/:id/upload-after', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded' });
    }

    // Delete old image if exists
    if (complaint.imageAfter) {
      const oldImagePath = path.join(__dirname, complaint.imageAfter);
      if (fs.existsSync(oldImagePath)) {
        fs.unlinkSync(oldImagePath);
      }
    }

    complaint.imageAfter = `/uploads/complaints/${req.file.filename}`;
    complaint.status = 'completed';
    complaint.resolvedAt = new Date();
    complaint.imageType = req.file.mimetype;
    complaint.fileSize = req.file.size;
    
    const updatedComplaint = await complaint.save();
    
    res.json(updatedComplaint);
  } catch (error) {
    console.error('❌ After image upload error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ✅ Update complaint status
app.put('/api/complaints/:id/status', async (req, res) => {
  try {
    const { status } = req.body;
    
    // If status is being changed to completed, set resolvedAt
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
   ✅ 404 HANDLER
   ======================= */
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

/* =======================
   ✅ ERROR HANDLER
   ======================= */
app.use((err, req, res, next) => {
  console.error('❌ Server Error:', err.stack);
  res.status(500).json({ 
    message: 'Something went wrong!',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

/* =======================
   ✅ START SERVER
   ======================= */
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`📁 Uploads served at: http://localhost:${PORT}/uploads`);
  console.log(`📝 API available at: http://localhost:${PORT}/api`);
  console.log(`📊 Health check: http://localhost:${PORT}/`);
});