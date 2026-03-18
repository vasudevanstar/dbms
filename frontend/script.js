const API_BASE = 'http://localhost:3000';

const getToken = () => localStorage.getItem('token');
const getUser = () => JSON.parse(localStorage.getItem('user') || 'null');

const showMessage = (containerId, message, type = 'success') => {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = `<div class="alert alert-${type}" role="alert">${message}</div>`;
  setTimeout(() => { container.innerHTML = ''; }, 5000);
};

const requestWithAuth = async (url, options = {}) => {
  const token = getToken();
  const headers = { ...(options.headers || {}) };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(API_BASE + url, { ...options, headers });
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || 'Error');
  return body;
};

const postData = async (url, data, auth = false) => {
  const options = {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  };
  return auth ? requestWithAuth(url, options) : requestWithAuth(url, options);
};

const putData = async (url, data) => {
  return requestWithAuth(url, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
};

const deleteData = async (url) => {
  return requestWithAuth(url, { method: 'DELETE' });
};

const getData = async (url) => {
  return requestWithAuth(url, { method: 'GET' });
};

const registerInit = () => {
  const form = document.getElementById('registerForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: document.getElementById('name').value.trim(),
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value.trim(),
        phone: document.getElementById('phone').value.trim(),
      };
      if (!payload.name || !payload.email || !payload.password || !payload.phone) {
        throw new Error('Please fill all fields');
      }
      await postData('/register', payload);
      showMessage('message', 'Registration successful! You can login now.', 'success');
      form.reset();
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  });
};

const loginInit = () => {
  const form = document.getElementById('loginForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      const payload = {
        email: document.getElementById('email').value.trim(),
        password: document.getElementById('password').value.trim(),
      };
      const resp = await requestWithAuth('/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      localStorage.setItem('token', resp.token);
      localStorage.setItem('user', JSON.stringify(resp.user));
      showMessage('message', 'Login successful', 'success');
      setTimeout(() => {
        if (resp.user.role === 'admin') {
          window.location.href = 'admin.html';
        } else {
          window.location.href = 'vehicles.html';
        }
      }, 1000);
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  });
};

const vehiclesInit = async () => {
  let currentPage = 1;

  const fetchVehicles = async () => {
    try {
      const search = document.getElementById('searchInput')?.value.trim() || '';
      const type = document.getElementById('typeFilter')?.value || '';
      const status = document.getElementById('availabilityFilter')?.value || '';
      const minPrice = document.getElementById('minPriceFilter')?.value || '';
      const maxPrice = document.getElementById('maxPriceFilter')?.value || '';

      const qs = new URLSearchParams();
      qs.append('page', currentPage);
      qs.append('perPage', 20);
      if (search) qs.append('search', search);
      if (type) qs.append('type', type);
      if (status) qs.append('status', status);
      if (minPrice) qs.append('minPrice', minPrice);
      if (maxPrice) qs.append('maxPrice', maxPrice);

      const response = await getData('/vehicles?' + qs.toString());
      const vehicles = response.vehicles || [];
      const container = document.getElementById('vehiclesList');
      if (!container) return;

      const pageInfo = document.getElementById('pageInfo');
      if (pageInfo) pageInfo.textContent = `Page ${response.page}`;

      if (!vehicles.length) {
        container.innerHTML = '<p class="text-muted">No vehicles found matching your criteria.</p>';
        return;
      }
      container.innerHTML = vehicles.map((v) => `
        <div class="col-sm-6 col-lg-4 mb-4 fade-in-scroll visible">
          <div class="card h-100 border-0 rounded-4">
            <div class="position-relative">
              <img src="${v.image}" class="card-img-top" alt="${v.name}" style="border-top-left-radius: 1rem; border-top-right-radius: 1rem;" />
              <div class="position-absolute top-0 end-0 m-2">
                <span class="badge ${v.status === 'Available' ? 'bg-success' : v.status === 'Booked' ? 'bg-danger' : 'bg-warning text-dark'} shadow-sm px-3 py-2 rounded-pill">${v.status}</span>
              </div>
            </div>
            <div class="card-body d-flex flex-column p-4">
              <h5 class="card-title d-flex justify-content-between align-items-center mb-1">
                <span class="fw-bold text-truncate">${v.brand || ''} ${v.name}</span>
                <span class="badge bg-light text-dark shadow-sm ms-2">⭐ ${v.rating_average || 'New'}</span>
              </h5>
              <div class="text-muted small mb-3"><i class="bi bi-calendar3 me-1"></i>${v.model_year || 'N/A'} model</div>
              <p class="card-text text-muted small mb-3 flex-grow-1" style="line-height: 1.5;">${v.description || 'No description available for this vehicle. Experience comfort and reliability.'}</p>
              
              <div class="vehicle-specs border-top pt-3 border-bottom pb-3 mb-3">
                <div title="Type"><i class="bi bi-car-front"></i> ${v.type}</div>
                <div title="Fuel"><i class="bi bi-fuel-pump"></i> ${v.fuel_type || 'N/A'}</div>
                <div title="Transmission"><i class="bi bi-gear-wide-connected"></i> ${v.transmission || 'N/A'}</div>
                <div title="Seats"><i class="bi bi-people"></i> ${v.seating_capacity || 'N/A'} Seats</div>
              </div>
              
              <div class="mt-auto d-flex justify-content-between align-items-center mb-3">
                <div>
                  <span class="price-tag">$${v.rent_per_day}</span><span class="text-muted small">/day</span>
                </div>
              </div>
              <a href="booking.html?vehicleId=${v.id}" class="btn btn-primary w-100 py-2 fw-bold text-uppercase ${v.status !== 'Available' ? ' disabled' : ''}" style="letter-spacing: 1px;">
                ${v.status === 'Available' ? 'Book Now <i class="bi bi-arrow-right-short ms-1"></i>' : '<i class="bi bi-lock-fill me-1"></i> Unavailable'}
              </a>
            </div>
          </div>
        </div>
      `).join('');
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  };

  document.getElementById('filterBtn')?.addEventListener('click', () => {
    currentPage = 1;
    fetchVehicles();
  });

  document.getElementById('prevPage')?.addEventListener('click', () => {
    if (currentPage > 1) {
      currentPage--;
      fetchVehicles();
    }
  });

  document.getElementById('nextPage')?.addEventListener('click', () => {
    currentPage++;
    fetchVehicles();
  });

  fetchVehicles();
};

const bookingInit = async () => {
  const params = new URLSearchParams(window.location.search);
  const vehicleId = params.get('vehicleId');
  if (vehicleId) document.getElementById('vehicleId').value = Number(vehicleId);
  const form = document.getElementById('bookingForm');
  
  const vehicleIdInput = document.getElementById('vehicleId');
  const startDateInput = document.getElementById('startDate');
  const endDateInput = document.getElementById('endDate');
  const availabilityBadge = document.getElementById('availabilityBadge');

  const checkAvailability = async () => {
    if (!startDateInput?.value || !endDateInput?.value || !vehicleIdInput?.value) return;
    try {
      const response = await fetch('/check-availability', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          vehicleId: Number(vehicleIdInput.value),
          startDate: startDateInput.value,
          endDate: endDateInput.value
        })
      });
      const data = await response.json();
      if (availabilityBadge) {
        if (data.available) {
          availabilityBadge.className = 'badge bg-success';
          availabilityBadge.textContent = '🟢 Available';
        } else {
          availabilityBadge.className = 'badge bg-danger';
          availabilityBadge.textContent = '🔴 Not Available';
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  startDateInput?.addEventListener('change', checkAvailability);
  endDateInput?.addEventListener('change', checkAvailability);
  
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const user = getUser();
    const payload = {
      vehicleId: Number(document.getElementById('vehicleId').value),
      startDate: document.getElementById('startDate').value,
      endDate: document.getElementById('endDate').value,
    };
    const paymentMethod = document.getElementById('method')?.value;
    if (!user || !payload.vehicleId || !payload.startDate || !payload.endDate || !paymentMethod) {
      showMessage('message', 'Please login and complete all fields including payment method', 'danger');
      return;
    }
    try {
      showMessage('message', 'Processing booking and payment...', 'info');
      
      const bookResp = await requestWithAuth('/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      await requestWithAuth('/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          rentalId: bookResp.rental.id,
          amount: bookResp.rental.total_amount,
          method: paymentMethod
        }),
      });

      showMessage('message', `Booking & Payment successful! Total charged: $${bookResp.rental.total_amount}. Redirecting to your history...`, 'success');
      form.reset();
      setTimeout(() => {
        window.location.href = 'history.html';
      }, 2000);
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  });
};

const paymentInit = () => {
  const params = new URLSearchParams(window.location.search);
  const rentalIdMatch = params.get('rentalId');
  const amountMatch = params.get('amount');
  if (rentalIdMatch) document.getElementById('rentalId').value = rentalIdMatch;
  if (amountMatch) document.getElementById('amount').value = amountMatch;

  const form = document.getElementById('paymentForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      rentalId: Number(document.getElementById('rentalId').value),
      amount: Number(document.getElementById('amount').value),
      method: document.getElementById('method').value,
    };
    if (!payload.rentalId || !payload.amount || !payload.method) {
      showMessage('message', 'All fields are required', 'danger');
      return;
    }
    try {
      await requestWithAuth('/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      showMessage('message', 'Payment successful and rental completed!', 'success');
      form.reset();
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  });
};

const historyInit = () => {
  const form = document.getElementById('historyForm');
  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.getElementById('historyEmail').value.trim();
    if (!email) {
      showMessage('message', 'Email is required', 'danger');
      return;
    }
    try {
      const bookings = await getData(`/bookings?email=${encodeURIComponent(email)}`);
      const container = document.getElementById('historyList');
      if (!container) return;
      if (!bookings.length) {
        container.innerHTML = '<p class="text-muted">No bookings found for this email.</p>';
        return;
      }
      container.innerHTML = `<div class="table-responsive"><table class="table table-hover align-middle border"><thead><tr class="table-light"><th>ID</th><th>Vehicle</th><th>Start</th><th>End</th><th>Total</th><th>Status</th><th>Actions</th></tr></thead><tbody class="border-top-0">${bookings.map((b) => {
        let actions = '';
        if (b.status === 'Completed' && !b.isRated) {
          actions += `<button class="btn btn-sm btn-outline-warning rounded-pill me-1" onclick="openRateModal(${b.id}, ${b.vehicleId})"><i class="bi bi-star"></i> Rate</button>`;
        }
        if (b.status !== 'Cancelled') {
          actions += `<button class="btn btn-sm btn-outline-info rounded-pill" onclick="downloadInvoice(${b.id})"><i class="bi bi-file-earmark-pdf"></i> Invoice</button>`;
        }
        const vName = b.vehicle?.name || b.vehicleId;
        return `<tr><td class="fw-bold text-muted">#${b.id}</td><td><i class="bi bi-car-front text-accent me-1"></i> ${vName}</td><td>${b.startDate}</td><td>${b.endDate}</td><td class="fw-bold text-success">$${b.total_amount}</td><td><span class="badge rounded-pill ${b.status === 'Completed'?'bg-success':b.status==='Ongoing'?'bg-primary':b.status==='Confirmed'?'bg-info':'bg-secondary'}">${b.status}</span></td><td>${actions}</td></tr>`;
      }).join('')}</tbody></table></div>`;
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  });

  const ratingForm = document.getElementById('ratingForm');
  ratingForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const payload = {
      rentalId: Number(document.getElementById('rateRentalId').value),
      vehicleId: Number(document.getElementById('rateVehicleId').value),
      rating: Number(document.getElementById('rateStars').value),
      review: document.getElementById('rateReview').value
    };
    try {
      await requestWithAuth('/rate-vehicle', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      showMessage('message', 'Review submitted successfully!', 'success');
      const modal = bootstrap.Modal.getInstance(document.getElementById('ratingModal'));
      modal?.hide();
      form.dispatchEvent(new Event('submit'));
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  });

  window.openRateModal = (rentalId, vehicleId) => {
    document.getElementById('rateRentalId').value = rentalId;
    document.getElementById('rateVehicleId').value = vehicleId;
    document.getElementById('rateStars').value = '5';
    document.getElementById('rateReview').value = '';
    const modal = new bootstrap.Modal(document.getElementById('ratingModal'));
    modal.show();
  };

  window.downloadInvoice = async (rentalId) => {
    const email = document.getElementById('historyEmail').value.trim();
    if (!email) return;
    try {
      const bookings = await getData(`/bookings?email=${encodeURIComponent(email)}`);
      const b = bookings.find(x => x.id === rentalId);
      if (!b) return;
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF();
      doc.setFontSize(22);
      doc.setTextColor(40);
      doc.text('Car Rental Invoice', 20, 20);
      doc.setFontSize(12);
      doc.setTextColor(100);
      doc.text(`Booking ID: #${b.id}`, 20, 35);
      doc.text(`Customer email: ${b.customerEmail}`, 20, 45);
      doc.setTextColor(40);
      doc.text(`Vehicle Details: ${b.vehicle?.brand || ''} ${b.vehicle?.name || b.vehicleId}`, 20, 60);
      doc.text(`Rental Period: ${b.startDate} to ${b.endDate} (${b.days} days)`, 20, 70);
      doc.text(`Status: ${b.status}`, 20, 80);
      doc.setFontSize(16);
      doc.text(`Total Amount Charged: $${b.total_amount}`, 20, 100);
      doc.save(`Invoice_${b.id}.pdf`);
    } catch (err) {
      showMessage('message', 'Failed to generate PDF. Make sure jsPDF is loaded.', 'danger');
    }
  };
};

const adminInit = async () => {
  const vehicleForm = document.getElementById('vehicleForm');
  const tableContainer = document.getElementById('vehicleTable');
  const bookingContainer = document.getElementById('bookingTable');

  const resetForm = () => {
    vehicleForm.reset();
    document.getElementById('vehicleId').value = '';
  };

  const loadVehicles = async () => {
    try {
      const vehicles = await getData('/admin/vehicles');
      if (!tableContainer) return;
      tableContainer.innerHTML = `<table class="table table-hover align-middle mb-0"><thead class="table-light border-bottom"><tr><th class="ps-3">ID</th><th>Name</th><th>Type</th><th>Rent</th><th>Status</th><th class="text-end pe-3">Actions</th></tr></thead><tbody>${vehicles.map((v) => `<tr><td class="ps-3 text-muted fw-bold">#${v.id}</td><td><div class="d-flex align-items-center"><img src="${v.image}" class="rounded me-2" style="width: 40px; height: 30px; object-fit: cover;">${v.name}</div></td><td>${v.type}</td><td class="text-success fw-bold">$${v.rent_per_day}</td><td><span class="badge rounded-pill ${v.status === 'Available' ? 'bg-success' : v.status === 'Booked' ? 'bg-danger' : 'bg-warning text-dark'}">${v.status}</span></td><td class="text-end pe-3"><button class="btn btn-sm btn-outline-primary rounded-pill me-1" onclick="editVehicle(${v.id})"><i class="bi bi-pencil"></i></button><button class="btn btn-sm btn-outline-danger rounded-pill" onclick="deleteVehicle(${v.id})"><i class="bi bi-trash"></i></button></td></tr>`).join('')}</tbody></table>`;
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  };

  const loadBookings = async () => {
    try {
      const bookings = await getData('/admin/bookings');
      if (!bookingContainer) return;
      if (!bookings.length) {
        bookingContainer.innerHTML = '<p>No bookings available</p>';
        return;
      }
      bookingContainer.innerHTML = `<table class="table table-hover align-middle text-nowrap mb-0"><thead class="table-light"><tr><th class="ps-3">ID</th><th>Customer</th><th>Vehicle</th><th>Dates</th><th>Total</th><th>Status</th></tr></thead><tbody>${bookings.map((b) => `<tr><td class="ps-3 fw-bold text-muted">#${b.id}</td><td>${b.customer?.name || b.customerEmail}</td><td>${b.vehicle?.name || b.vehicleId}</td><td><span class="small text-muted">${b.startDate} ➔ ${b.endDate}</span></td><td class="text-success fw-bold">$${b.total_amount}</td><td><span class="badge rounded-pill ${b.status === 'Completed'?'bg-success':b.status==='Ongoing'?'bg-primary':'bg-secondary'}">${b.status}</span></td></tr>`).join('')}</tbody></table>`;
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  };

  const loadAnalytics = async () => {
    try {
      const analytics = await getData('/admin/analytics');
      const cardsContainer = document.getElementById('analyticsCards');
      if (cardsContainer) {
        const vehicleName = analytics.mostRentedVehicle ? (analytics.mostRentedVehicle.brand || '') + ' ' + (analytics.mostRentedVehicle.name || 'Unknown') : 'N/A';
        cardsContainer.innerHTML = `
          <div class="col-md-4"><div class="admin-card bg-gradient-success"><div class="card-body p-1"><h6 class="text-white-50 text-uppercase fw-bold m-0"><i class="bi bi-calendar-check me-2"></i> Total Bookings</h6><h2 class="display-6 fw-bold mt-2 mb-0">${analytics.totalBookings}</h2><i class="bi bi-journal-check position-absolute" style="right: -10px; bottom: -20px; font-size: 6rem; opacity: 0.15;"></i></div></div></div>
          <div class="col-md-4"><div class="admin-card bg-gradient-primary"><div class="card-body p-1"><h6 class="text-white-50 text-uppercase fw-bold m-0"><i class="bi bi-wallet2 me-2"></i> Total Revenue</h6><h2 class="display-6 fw-bold mt-2 mb-0">$${analytics.totalRevenue}</h2><i class="bi bi-currency-dollar position-absolute" style="right: -10px; bottom: -10px; font-size: 6rem; opacity: 0.15;"></i></div></div></div>
          <div class="col-md-4"><div class="admin-card bg-gradient-info"><div class="card-body p-1"><h6 class="text-white-50 text-uppercase fw-bold m-0"><i class="bi bi-star-fill me-2"></i> Top Vehicle</h6><h3 class="fw-bold mt-3 mb-0 text-truncate" title="${vehicleName}">${vehicleName}</h3><i class="bi bi-trophy position-absolute" style="right: 0px; bottom: -10px; font-size: 5rem; opacity: 0.15;"></i></div></div></div>
        `;
      }

      if (analytics.maintenanceAlerts && analytics.maintenanceAlerts.length > 0) {
        document.getElementById('maintenanceAlertsSection').style.display = 'flex';
        const list = document.getElementById('maintenanceList');
        list.innerHTML = analytics.maintenanceAlerts.map(v => {
          let reason = '';
          if (v.status === 'Maintenance') reason = 'Currently flagged as Maintenance';
          else if (v.total_trips >= 50) reason = `High usage alert (${v.total_trips} total trips)`;
          else reason = `Insurance expiring soon (${v.insurance_valid_till})`;
          return `<li><strong>Vehicle #${v.id}</strong> (${v.brand || ''} ${v.name}) - ${reason}</li>`;
        }).join('');
      } else {
        document.getElementById('maintenanceAlertsSection').style.display = 'none';
      }

      const canvas = document.getElementById('revenueChart');
      if (canvas && window.Chart) {
        if (window.adminRevenueChart) {
          window.adminRevenueChart.destroy();
        }
        
        let labels = Object.keys(analytics.monthlyRevenue);
        let dataValues = Object.values(analytics.monthlyRevenue);

        if (labels.length === 0) {
          labels = ['Current Month'];
          dataValues = [0];
        }

        const ctx = canvas.getContext('2d');
        window.adminRevenueChart = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: labels,
            datasets: [{
              label: 'Monthly Revenue ($)',
              data: dataValues,
              backgroundColor: 'rgba(54, 162, 235, 0.7)',
              borderColor: 'rgba(54, 162, 235, 1)',
              borderWidth: 1,
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            scales: {
              y: { beginAtZero: true }
            }
          }
        });
      }
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  };

  window.editVehicle = async (id) => {
    try {
      const vehicles = await getData('/admin/vehicles');
      const vehicle = vehicles.find((v) => v.id === id);
      if (!vehicle) throw new Error('Vehicle not found');
      document.getElementById('vehicleId').value = vehicle.id;
      document.getElementById('vehicleName').value = vehicle.name;
      document.getElementById('vehicleType').value = vehicle.type;
      document.getElementById('vehicleRent').value = vehicle.rent_per_day;
      document.getElementById('vehicleStatus').value = vehicle.status;
      document.getElementById('vehicleImage').value = vehicle.image;
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  };

  window.deleteVehicle = async (id) => {
    if (!confirm('Delete this vehicle?')) return;
    try {
      await deleteData(`/admin/delete-vehicle?id=${id}`);
      showMessage('message', 'Vehicle deleted', 'success');
      loadVehicles();
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  };

  vehicleForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const id = Number(document.getElementById('vehicleId').value);
    const payload = {
      id: id || undefined,
      name: document.getElementById('vehicleName').value.trim(),
      type: document.getElementById('vehicleType').value.trim(),
      rent_per_day: Number(document.getElementById('vehicleRent').value),
      status: document.getElementById('vehicleStatus').value,
      image: document.getElementById('vehicleImage').value.trim() || 'https://via.placeholder.com/300x180?text=Vehicle',
    };
    try {
      if (id) {
        await putData('/admin/update-vehicle', payload);
        showMessage('message', 'Vehicle updated', 'success');
      } else {
        await postData('/admin/add-vehicle', payload);
        showMessage('message', 'Vehicle added', 'success');
      }
      resetForm();
      loadVehicles();
    } catch (err) {
      showMessage('message', err.message, 'danger');
    }
  });

  document.getElementById('resetBtn')?.addEventListener('click', resetForm);
  loadVehicles();
  loadBookings();
  loadAnalytics();
};

const init = () => {
  const page = window.location.pathname.split('/').pop();
  if (page === 'register.html') registerInit();
  if (page === 'login.html') loginInit();
  if (page === 'vehicles.html') vehiclesInit();
  if (page === 'booking.html') bookingInit();
  if (page === 'payment.html') paymentInit();
  if (page === 'history.html') historyInit();
  if (page === 'admin.html') adminInit();
};

init();
