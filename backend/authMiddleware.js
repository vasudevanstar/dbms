const jwt = require('jsonwebtoken');
const fs = require('fs');
const path = require('path');

const secret = process.env.JWT_SECRET || 'car_rental_secret';
const dataDir = path.join(__dirname, 'data');

const readData = (fileName) => {
  const fullPath = path.join(dataDir, fileName);
  if (!fs.existsSync(fullPath)) return [];
  try {
    return JSON.parse(fs.readFileSync(fullPath, 'utf8')) || [];
  } catch (e) {
    return [];
  }
};

const auth = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return res.status(401).json({ message: 'Authorization header is missing' });

  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Token missing' });

  try {
    const decoded = jwt.verify(token, secret);
    req.user = decoded;
    next();
  } catch (err) {
    res.status(401).json({ message: 'Invalid or expired token' });
  }
};

const adminOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ message: 'Admin resource, access denied' });
  }
  next();
};

const customerOnly = (req, res, next) => {
  if (!req.user || req.user.role !== 'customer') {
    return res.status(403).json({ message: 'Customer resource, access denied' });
  }
  next();
};

const findUser = (email) => {
  const users = readData('customers.json');
  return users.find((u) => u.email.toLowerCase() === email.toLowerCase());
};

module.exports = { auth, adminOnly, customerOnly, secret, findUser };