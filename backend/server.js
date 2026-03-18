const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const nodemailer = require('nodemailer');

const { auth, adminOnly, customerOnly, secret } = require('./authMiddleware');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, '../frontend')));

const dataDir = path.join(__dirname, 'data');
const uploadDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    const name = `${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`;
    cb(null, name);
  },
});
const upload = multer({ storage });

const readData = (fileName) => {
  const fullPath = path.join(dataDir, fileName);
  if (!fs.existsSync(fullPath)) return [];
  const raw = fs.readFileSync(fullPath, 'utf-8');
  try {
    return JSON.parse(raw) || [];
  } catch (error) {
    return [];
  }
};

const writeData = (fileName, data) => {
  const fullPath = path.join(dataDir, fileName);
  fs.writeFileSync(fullPath, JSON.stringify(data, null, 2), 'utf-8');
};

const updateRentalStatuses = () => {
  const rentals = readData('rentals.json');
  const vehicles = readData('vehicles.json');
  let rentalsChanged = false;
  let vehiclesChanged = false;
  
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  rentals.forEach((r) => {
    if (r.status === 'Pending' || r.status === 'Cancelled') return;
    
    const rStart = new Date(r.startDate);
    const rEnd = new Date(r.endDate);
    rStart.setHours(0, 0, 0, 0);
    rEnd.setHours(0, 0, 0, 0);

    let newStatus = r.status;
    if (today > rEnd) {
      newStatus = 'Completed';
    } else if (today >= rStart && today <= rEnd) {
      newStatus = 'Ongoing';
    } else if (today < rStart && r.status !== 'Cancelled') {
      newStatus = 'Confirmed';
    }

    if (newStatus !== r.status) {
      r.status = newStatus;
      rentalsChanged = true;
    }
  });

  if (rentalsChanged) writeData('rentals.json', rentals);
  
  // Also sync vehicle statuses
  vehicles.forEach(v => {
    if (v.isActive === false || v.status === 'Maintenance') return;
    
    // Check if vehicle has any ongoing or upcoming rentals
    const activeRentals = rentals.filter(r => r.vehicleId === v.id && r.status !== 'Cancelled' && r.status !== 'Completed');
    
    const hasOngoing = activeRentals.some(r => r.status === 'Ongoing');
    let newStatus = hasOngoing ? 'Booked' : 'Available';
    
    if (v.status !== newStatus) {
      v.status = newStatus;
      vehiclesChanged = true;
    }
  });
  if (vehiclesChanged) writeData('vehicles.json', vehicles);
};


const getNextId = (items) => {
  if (!items.length) return 1;
  return Math.max(...items.map((i) => i.id || 0)) + 1;
};

const transporter = nodemailer.createTransport({
  host: 'smtp.ethereal.email',
  port: 587,
  auth: {
    user: 'your_ethereal_user@ethereal.email',
    pass: 'your_ethereal_pass',
  },
});

const sendEmail = async ({ to, subject, text }) => {
  try {
    await transporter.sendMail({ from: 'no-reply@carrental.com', to, subject, text });
  } catch (err) {
    console.error('Email send failed', err.message);
  }
};

app.post('/register', upload.single('license'), (req, res) => {
  const { name, email, password, phone, role } = req.body;
  if (!name || !email || !password || !phone) {
    return res.status(400).json({ message: 'All fields are required' });
  }

  const customers = readData('customers.json');
  const existing = customers.find((c) => c.email.toLowerCase() === email.toLowerCase());
  if (existing) return res.status(400).json({ message: 'Email already registered' });

  const customer = {
    id: getNextId(customers),
    name,
    email,
    password,
    phone,
    role: role === 'admin' ? 'admin' : 'customer',
    licenseImage: req.file ? `/uploads/${req.file.filename}` : null,
    isActive: true,
  };
  customers.push(customer);
  writeData('customers.json', customers);

  sendEmail({
    to: email,
    subject: 'Welcome to Car Rental System',
    text: `Hello ${name},\nYour registration is successful.`,
  });

  res.json({ message: 'Registration successful', customer });
});

app.post('/login', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required' });
  }

  const customers = readData('customers.json');
  const user = customers.find((c) => c.email.toLowerCase() === email.toLowerCase() && c.password === password && c.isActive);
  if (!user) return res.status(401).json({ message: 'Invalid credentials' });

  const payload = { id: user.id, name: user.name, email: user.email, role: user.role };
  const token = jwt.sign(payload, secret, { expiresIn: '2h' });

  res.json({ message: 'Login successful', token, user: payload });
});

app.get('/vehicles', (req, res) => {
  updateRentalStatuses();
  const vehicles = readData('vehicles.json').filter((v) => v.isActive !== false);
  let filtered = vehicles;

  const { type, status, search, minPrice, maxPrice } = req.query;
  if (type) filtered = filtered.filter((v) => v.type.toLowerCase() === type.toLowerCase());
  if (status) filtered = filtered.filter((v) => v.status.toLowerCase() === status.toLowerCase());
  if (search) filtered = filtered.filter((v) => v.name.toLowerCase().includes(search.toLowerCase()));
  if (minPrice) filtered = filtered.filter((v) => v.rent_per_day >= Number(minPrice));
  if (maxPrice) filtered = filtered.filter((v) => v.rent_per_day <= Number(maxPrice));

  const page = Number(req.query.page) || 1;
  const perPage = Number(req.query.perPage) || 20;
  const start = (page - 1) * perPage;
  const paginated = filtered.slice(start, start + perPage);

  res.json({ total: filtered.length, page, perPage, vehicles: paginated });
});

const overlaps = (newStart, newEnd, existingStart, existingEnd) => {
  return newStart <= existingEnd && newEnd >= existingStart;
};

app.post('/check-availability', (req, res) => {
  const { vehicleId, startDate, endDate } = req.body;
  if (!vehicleId || !startDate || !endDate) return res.status(400).json({ available: false });
  
  const start = new Date(startDate);
  const end = new Date(endDate);
  const rentals = readData('rentals.json');
  
  const conflict = rentals.some((r) => r.vehicleId === Number(vehicleId) && r.status !== 'Cancelled' && r.status !== 'Completed' && overlaps(start, end, new Date(r.startDate), new Date(r.endDate)));
  
  res.json({ available: !conflict });
});

app.post('/book', auth, customerOnly, (req, res) => {
  const { vehicleId, startDate, endDate } = req.body;
  const customerEmail = req.user.email;

  if (!customerEmail || !vehicleId || !startDate || !endDate) {
    return res.status(400).json({ message: 'All booking details are required' });
  }

  const vehicles = readData('vehicles.json');
  const vehicle = vehicles.find((v) => v.id === Number(vehicleId) && v.isActive !== false);
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) {
    return res.status(400).json({ message: 'Invalid start or end date' });
  }

  const rentals = readData('rentals.json');
  const conflict = rentals.some((r) => r.vehicleId === vehicle.id && r.status !== 'Cancelled' && r.status !== 'Completed' && overlaps(start, end, new Date(r.startDate), new Date(r.endDate)));
  if (conflict) {
    return res.status(400).json({ message: 'Selected dates overlap existing booking' });
  }

  const days = Math.ceil((end - start) / (1000 * 60 * 60 * 24)) + 1;
  let total_amount = vehicle.rent_per_day * days;

  // Dynamic Pricing Engine
  let weekendDays = 0;
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    if (d.getDay() === 0 || d.getDay() === 6) weekendDays++;
  }
  if (weekendDays > 0) {
    total_amount += (vehicle.rent_per_day * 0.10 * weekendDays); // Weekend +10%
  }
  
  if (days > 7) {
    total_amount *= 0.9; // Long-term booking -10% discount
  }

  total_amount = Math.round(total_amount * 100) / 100;


  const rental = {
    id: getNextId(rentals),
    customerEmail,
    vehicleId: vehicle.id,
    startDate,
    endDate,
    days,
    total_amount,
    status: 'Pending',
    createdAt: new Date().toISOString(),
  };

  rentals.push(rental);
  writeData('rentals.json', rentals);

  vehicle.status = 'Booked';
  writeData('vehicles.json', vehicles);

  sendEmail({
    to: customerEmail,
    subject: 'Booking Request Received',
    text: `Your booking for ${vehicle.name} is received and pending confirmation.`,
  });

  res.json({ message: 'Booking created and pending confirmation', rental });
});

app.post('/payment', auth, (req, res) => {
  const { rentalId, amount, method } = req.body;
  if (!rentalId || !amount || !method) {
    return res.status(400).json({ message: 'Payment details are required' });
  }

  const rentals = readData('rentals.json');
  const rental = rentals.find((r) => r.id === Number(rentalId));
  if (!rental) return res.status(404).json({ message: 'Rental not found' });
  if (rental.status === 'Cancelled') return res.status(400).json({ message: 'Cannot pay cancelled rental' });

  const payments = readData('payments.json');
  const payment = {
    id: getNextId(payments),
    rentalId: rental.id,
    amount,
    method,
    paidAt: new Date().toISOString(),
  };
  payments.push(payment);
  writeData('payments.json', payments);

  rental.status = 'Confirmed';
  writeData('rentals.json', rentals);

  sendEmail({
    to: rental.customerEmail,
    subject: 'Payment Confirmed',
    text: `Your payment for rental ${rental.id} is confirmed.`,
  });

  res.json({ message: 'Payment processed and rental confirmed', payment });
});

app.post('/cancel-booking', auth, customerOnly, (req, res) => {
  const { rentalId } = req.body;
  if (!rentalId) return res.status(400).json({ message: 'Rental id required' });

  const rentals = readData('rentals.json');
  const rental = rentals.find((r) => r.id === Number(rentalId));
  if (!rental) return res.status(404).json({ message: 'Rental not found' });
  if (rental.customerEmail.toLowerCase() !== req.user.email.toLowerCase()) {
    return res.status(403).json({ message: 'Cannot cancel others booking' });
  }
  const start = new Date(rental.startDate);
  if (start <= new Date()) return res.status(400).json({ message: 'Cannot cancel after start date' });

  rental.status = 'Cancelled';
  writeData('rentals.json', rentals);

  const vehicles = readData('vehicles.json');
  const vehicle = vehicles.find((v) => v.id === Number(rental.vehicleId));
  if (vehicle) {
    vehicle.status = 'Available';
    writeData('vehicles.json', vehicles);
  }

  res.json({ message: 'Booking cancelled successfully' });
});

app.get('/bookings', auth, (req, res) => {
  updateRentalStatuses();
  const customerEmail = req.query.email || req.user.email;
  const rentals = readData('rentals.json');
  const vehicles = readData('vehicles.json');

  const customerBookings = rentals
    .filter((r) => r.customerEmail.toLowerCase() === customerEmail.toLowerCase())
    .map((r) => ({
      ...r,
      vehicle: vehicles.find((v) => v.id === Number(r.vehicleId)) || null,
    }));

  res.json(customerBookings);
});

app.get('/admin/bookings', auth, adminOnly, (req, res) => {
  updateRentalStatuses();
  const rentals = readData('rentals.json');
  const vehicles = readData('vehicles.json');
  const customers = readData('customers.json');

  const result = rentals.map((r) => ({
    ...r,
    vehicle: vehicles.find((v) => v.id === Number(r.vehicleId)) || null,
    customer: customers.find((c) => c.email === r.customerEmail) || null,
  }));
  res.json(result);
});

app.get('/admin/vehicles', auth, adminOnly, (req, res) => {
  updateRentalStatuses();
  const vehicles = readData('vehicles.json');
  res.json(vehicles);
});

app.post('/admin/add-vehicle', auth, adminOnly, (req, res) => {
  const { name, type, rent_per_day, status, image } = req.body;
  if (!name || !type || !rent_per_day) {
    return res.status(400).json({ message: 'Name, type and rent per day are required' });
  }
  const vehicles = readData('vehicles.json');
  const vehicle = {
    id: getNextId(vehicles),
    name,
    type,
    rent_per_day: Number(rent_per_day),
    status: status || 'Available',
    image: image || 'https://via.placeholder.com/300x180?text=Vehicle',
    isActive: true,
    ratings: [],
    lastService: new Date().toISOString(),
  };
  vehicles.push(vehicle);
  writeData('vehicles.json', vehicles);
  res.json({ message: 'Vehicle added successfully', vehicle });
});

app.put('/admin/update-vehicle', auth, adminOnly, (req, res) => {
  const { id, name, type, rent_per_day, status, image, isActive, lastService } = req.body;
  if (!id) return res.status(400).json({ message: 'Vehicle id is required' });

  const vehicles = readData('vehicles.json');
  const vehicle = vehicles.find((v) => v.id === Number(id));
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

  if (name) vehicle.name = name;
  if (type) vehicle.type = type;
  if (rent_per_day !== undefined) vehicle.rent_per_day = Number(rent_per_day);
  if (status) vehicle.status = status;
  if (image) vehicle.image = image;
  if (isActive !== undefined) vehicle.isActive = Boolean(isActive);
  if (lastService) vehicle.lastService = lastService;

  writeData('vehicles.json', vehicles);
  res.json({ message: 'Vehicle updated successfully', vehicle });
});

app.delete('/admin/delete-vehicle', auth, adminOnly, (req, res) => {
  const id = Number(req.query.id || req.body.id);
  if (!id) return res.status(400).json({ message: 'Vehicle id is required' });

  const vehicles = readData('vehicles.json');
  const vehicle = vehicles.find((v) => v.id === id);
  if (!vehicle) return res.status(404).json({ message: 'Vehicle not found' });

  vehicle.isActive = false;
  writeData('vehicles.json', vehicles);
  res.json({ message: 'Vehicle soft-deleted successfully' });
});

app.get('/admin/analytics', auth, adminOnly, (req, res) => {
  const rentals = readData('rentals.json');
  const vehicles = readData('vehicles.json');

  const totalBookings = rentals.length;
  const totalRevenue = rentals.reduce((sum, item) => sum + (item.total_amount || 0), 0);

  const vehicleCount = {};
  rentals.forEach((r) => { vehicleCount[r.vehicleId] = (vehicleCount[r.vehicleId] || 0) + 1; });
  const mostRentedVehicleId = Object.keys(vehicleCount).reduce((a, b) => (vehicleCount[a] > vehicleCount[b] ? a : b), Object.keys(vehicleCount)[0] || null);
  const mostRentedVehicle = vehicles.find((v) => v.id === Number(mostRentedVehicleId)) || null;

  // Maintenance Alert
  const maintenanceAlerts = vehicles.filter(v => {
    if (v.status === 'Maintenance') return true;
    if (v.total_trips >= 50) return true;
    if (v.insurance_valid_till) {
      const insDate = new Date(v.insurance_valid_till);
      const thirtyDaysFromNow = new Date();
      thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
      if (insDate <= thirtyDaysFromNow) return true;
    }
    return false;
  });

  const monthlyRevenue = {};
  rentals.forEach((r) => {
    const month = new Date(r.createdAt).toISOString().slice(0, 7);
    monthlyRevenue[month] = (monthlyRevenue[month] || 0) + (r.total_amount || 0);
  });

  res.json({ totalBookings, totalRevenue, mostRentedVehicle, monthlyRevenue, maintenanceAlerts });
});

app.post('/rate-vehicle', auth, customerOnly, (req, res) => {
  const { vehicleId, rentalId, rating, review } = req.body;
  if (!vehicleId || !rentalId || !rating) return res.status(400).json({ message: 'Rating details required' });
  
  const rentals = readData('rentals.json');
  const rental = rentals.find(r => r.id === Number(rentalId) && r.customerEmail.toLowerCase() === req.user.email.toLowerCase());
  if (!rental || rental.status !== 'Completed') {
    return res.status(400).json({ message: 'Can only rate completed rentals' });
  }
  
  if (rental.isRated) return res.status(400).json({ message: 'Already rated this trip' });
  rental.isRated = true;

  const vehicles = readData('vehicles.json');
  const vehicle = vehicles.find(v => v.id === Number(vehicleId));
  if (vehicle) {
    if (!vehicle.ratings) vehicle.ratings = [];
    vehicle.ratings.push({ rating: Number(rating), review, email: req.user.email, date: new Date().toISOString() });
    
    // Calculate new average
    const avg = vehicle.ratings.reduce((sum, r) => sum + r.rating, 0) / vehicle.ratings.length;
    vehicle.rating_average = Math.round(avg * 10) / 10;
  }
  
  writeData('rentals.json', rentals);
  writeData('vehicles.json', vehicles);
  
  res.json({ message: 'Thank you for your rating!', rating_average: vehicle.rating_average });
});

app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
