CREATE TABLE users (
    user_id SERIAL PRIMARY KEY,
    full_name VARCHAR(100) NOT NULL CHECK (length(full_name) >= 3),
    email VARCHAR(150) NOT NULL UNIQUE,
    phone VARCHAR(15) NOT NULL UNIQUE,
    password TEXT NOT NULL,
    role VARCHAR(10) NOT NULL CHECK (role IN ('USER', 'ADMIN')),
    profile_photo TEXT,

    -- Driver license (merged)
    license_no VARCHAR(50) UNIQUE,
    license_pdf TEXT,
    license_expiry_date DATE CHECK (license_expiry_date > CURRENT_DATE),
    license_status VARCHAR(15) CHECK (license_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    license_verified_at TIMESTAMP,
    gender VARCHAR(20) CHECK (gender IN ('MALE', 'FEMALE', 'OTHER', 'PREFER_NOT_TO_SAY')),
    id_card_photo TEXT,
    id_card_status VARCHAR(15) CHECK (id_card_status IN ('PENDING', 'VERIFIED', 'REJECTED')),
    id_card_verified_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE vehicles (
    vehicle_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    vehicle_number VARCHAR(20) NOT NULL UNIQUE,
    model VARCHAR(50) NOT NULL,
    seats INT NOT NULL CHECK (seats BETWEEN 1 AND 10),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE rides (
    ride_id SERIAL PRIMARY KEY,
    driver_id INT NOT NULL REFERENCES users(user_id),
    vehicle_id INT NOT NULL REFERENCES vehicles(vehicle_id),

    source TEXT NOT NULL,
    destination TEXT NOT NULL,
    ride_date DATE NOT NULL,
    ride_time TIME NOT NULL,

    total_seats INT NOT NULL CHECK (total_seats > 0),
    available_seats INT NOT NULL CHECK (available_seats >= 0),
    base_price NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
    total_stops INT NOT NULL CHECK (total_stops >= 0),

    source_lat DOUBLE PRECISION,
    source_lng DOUBLE PRECISION,
    dest_lat DOUBLE PRECISION,
    dest_lng DOUBLE PRECISION,
    route_polyline TEXT,

    status VARCHAR(15) CHECK (status IN ('ACTIVE', 'CANCELLED', 'STARTED', 'COMPLETED')),
    booking_type VARCHAR(10) DEFAULT 'INSTANT' CHECK (booking_type IN ('INSTANT', 'APPROVAL')),

    -- Cancellation (merged)
    cancelled_by INT REFERENCES users(user_id),
    cancellation_reason TEXT,
    cancelled_at TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    CHECK (available_seats <= total_seats)
);

CREATE TABLE stops (
    stop_id SERIAL PRIMARY KEY,
    parent_type VARCHAR(10) NOT NULL CHECK (parent_type IN ('RIDE', 'TEMPLATE')),
    parent_id INT NOT NULL,

    city_name TEXT NOT NULL,
    latitude NUMERIC(10,6) NOT NULL,
    longitude NUMERIC(10,6) NOT NULL,
    stop_order INT NOT NULL CHECK (stop_order > 0),
    stop_price NUMERIC(10,2) NOT NULL CHECK (stop_price >= 0),

    UNIQUE (parent_type, parent_id, stop_order)
);

CREATE TABLE bookings (
    booking_id SERIAL PRIMARY KEY,
    ride_id INT NOT NULL REFERENCES rides(ride_id) ON DELETE CASCADE,
    rider_id INT NOT NULL REFERENCES users(user_id),

    seats_booked INT NOT NULL CHECK (seats_booked > 0),
    booking_status VARCHAR(15) CHECK (booking_status IN ('CONFIRMED', 'CANCELLED', 'COMPLETED', 'PENDING', 'REJECTED')),

    -- Payment (merged)
    amount NUMERIC(10,2) NOT NULL CHECK (amount >= 0),
    payment_method VARCHAR(20) CHECK (payment_method IN ('UPI', 'CARD', 'NETBANKING', 'WALLET')),
    transaction_ref VARCHAR(100) UNIQUE,
    payment_status VARCHAR(15) CHECK (payment_status IN ('SUCCESS', 'FAILED', 'PENDING')),
    payment_time TIMESTAMP,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE reports (
    report_id SERIAL PRIMARY KEY,
    ride_id INT NOT NULL REFERENCES rides(ride_id),
    reported_by INT NOT NULL REFERENCES users(user_id),
    reported_against INT NOT NULL REFERENCES users(user_id),

    category VARCHAR(50) NOT NULL,
    issue_description TEXT NOT NULL,
    admin_remarks TEXT,

    status VARCHAR(10) CHECK (status IN ('OPEN', 'RESOLVED')),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    resolved_at TIMESTAMP
);

CREATE TABLE ratings (
    rating_id SERIAL PRIMARY KEY,
    ride_id INT NOT NULL REFERENCES rides(ride_id),
    rated_by INT NOT NULL REFERENCES users(user_id),
    rated_user INT NOT NULL REFERENCES users(user_id),

    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    review TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (ride_id, rated_by, rated_user)
);

CREATE TABLE ride_template (
    template_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id),

    source TEXT NOT NULL,
    destination TEXT NOT NULL,
    source_lat DOUBLE PRECISION,
    source_lng DOUBLE PRECISION,
    dest_lat DOUBLE PRECISION,
    dest_lng DOUBLE PRECISION,
    ride_time TIME,
    total_seats INT NOT NULL CHECK (total_seats > 0),
    base_price NUMERIC(10,2) NOT NULL CHECK (base_price >= 0),
    vehicle_id INTEGER REFERENCES vehicles(vehicle_id) ON DELETE SET NULL,
    booking_type VARCHAR(10) DEFAULT 'INSTANT' CHECK (booking_type IN ('INSTANT', 'APPROVAL')),
    route_polyline TEXT,

    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);


CREATE TABLE locations (
    location_id SERIAL PRIMARY KEY,
    ride_id INT NOT NULL REFERENCES rides(ride_id) ON DELETE CASCADE,

    latitude NUMERIC(10,6) NOT NULL,
    longitude NUMERIC(10,6) NOT NULL,
    recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE notifications (
    notification_id SERIAL PRIMARY KEY,
    user_id INT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
    type VARCHAR(50) NOT NULL, -- e.g., 'RIDE_CANCELLED', 'BOOKING_CANCELLED'
    message TEXT NOT NULL,
    is_read BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
