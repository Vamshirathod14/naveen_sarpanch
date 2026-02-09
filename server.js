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
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true
});

/* =======================
   ✅ MIDDLEWARE
   ======================= */
app.use(cors({
  origin: '*'
}));
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

/* =======================
   ✅ MULTER MEMORY STORAGE (No local files)
   ======================= */
const storage = multer.memoryStorage();
const upload = multer({
  storage: storage,
  limits: { 
    fileSize: 20 * 1024 * 1024, // 20MB
    files: 1
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/gif', 
      'image/webp', 'image/heic', 'image/heif', 'image/avif',
      'image/tiff', 'image/bmp'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only images are allowed.'));
    }
  }
});

const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ 
        message: 'File size is too large. Maximum size is 20MB.' 
      });
    }
    return res.status(400).json({ message: err.message });
  } else if (err) {
    return res.status(400).json({ message: err.message });
  }
  next();
};

/* =======================
   ✅ CLOUDINARY UPLOAD FUNCTION
   ======================= */
const uploadToCloudinary = (fileBuffer, fileName, folder = 'sarpanch-complaints') => {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        public_id: fileName.replace(/\.[^/.]+$/, ""), // Remove extension
        resource_type: 'auto', // Auto-detect image type
        transformation: [
          { quality: 'auto', fetch_format: 'auto' }, // Auto-optimize
          { width: 1920, crop: 'limit' } // Limit max width
        ]
      },
      (error, result) => {
        if (error) {
          reject(error);
        } else {
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
  serverSelectionTimeoutMS: 5000
})
.then(() => console.log('✅ MongoDB Connected'))
.catch(err => console.error('❌ MongoDB Error:', err));

/* =======================
   ✅ HEALTH CHECK
   ======================= */
app.get('/', (req, res) => {
  res.json({ 
    message: '🚀 Naveen Seva Mitra Backend Running with Cloudinary!',
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
    const fileName = `complaint_${Date.now()}_${req.file.originalname}`;
    const cloudinaryResult = await uploadToCloudinary(
      req.file.buffer, 
      fileName,
      'sarpanch-complaints/before'
    );

    console.log('✅ Cloudinary upload successful:', cloudinaryResult.secure_url);

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
      message: 'Server error',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ✅ Upload before image (Admin Panel)
app.post('/api/complaints/:id/upload-before', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded' });
    }

    // Delete old image from Cloudinary if exists
    if (complaint.cloudinaryIdBefore) {
      try {
        await cloudinary.uploader.destroy(complaint.cloudinaryIdBefore);
        console.log('🗑️ Deleted old before image from Cloudinary');
      } catch (deleteError) {
        console.warn('⚠️ Could not delete old image:', deleteError.message);
      }
    }

    // Upload new image to Cloudinary
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
    
    res.json(updatedComplaint);
  } catch (error) {
    console.error('❌ Before image upload error:', error);
    res.status(500).json({ message: error.message });
  }
});

// ✅ Upload after image (Admin Panel)
app.post('/api/complaints/:id/upload-after', upload.single('image'), handleMulterError, async (req, res) => {
  try {
    const complaint = await Complaint.findById(req.params.id);
    if (!complaint) {
      return res.status(404).json({ message: 'Complaint not found' });
    }

    if (!req.file) {
      return res.status(400).json({ message: 'No image file uploaded' });
    }

    // Delete old image from Cloudinary if exists
    if (complaint.cloudinaryIdAfter) {
      try {
        await cloudinary.uploader.destroy(complaint.cloudinaryIdAfter);
        console.log('🗑️ Deleted old after image from Cloudinary');
      } catch (deleteError) {
        console.warn('⚠️ Could not delete old image:', deleteError.message);
      }
    }

    // Upload new image to Cloudinary
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
    
    res.json(updatedComplaint);
  } catch (error) {
    console.error('❌ After image upload error:', error);
    res.status(500).json({ message: error.message });
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
   ✅ ACTIVITY ROUTES (Unchanged)
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
   ✅ 404 & ERROR HANDLERS
   ======================= */
app.use((req, res) => {
  res.status(404).json({ message: `Route ${req.originalUrl} not found` });
});

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
  console.log(`☁️  Cloudinary configured for image storage`);
  console.log(`📝 API available at: http://localhost:${PORT}/api`);
});