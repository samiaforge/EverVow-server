
import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import dns from "node:dns";
import { jwtVerify, createRemoteJWKSet } from "jose";

// DNS configuration
dns.setServers(["1.1.1.1"]);

const app = express();
const port = process.env.PORT || 5000;

// Middleware
app.use(express.json());
app.use(cors());

// JWKS configuration
const JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", process.env.BETTER_AUTH_URL)
);

// MongoDB connection
const client = new MongoClient(
  `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.w23gcv8.mongodb.net/`
);

export async function connectToMongoDB() {
  try {
    await client.connect();
    console.log("You successfully connected to MongoDB!");
    return client;
  } catch (err) {
    console.error("MongoDB connection failed:", err);
    throw err;
  }
}

const connectedClient = await connectToMongoDB();
const database = connectedClient.db("weddingplan");

// Collections
const users = database.collection("user");
const services = database.collection("services");
const bookings = database.collection("bookings");
const transactions = database.collection("transactions");



// Authentication Middleware


const verifyToken = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader) {
      return res.status(401).send({
        message: "Unauthorized",
      });
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).send({
        message: "Unauthorized",
      });
    }

    // Verify JWT
    const { payload } = await jwtVerify(token, JWKS, {
      issuer: process.env.BETTER_AUTH_URL,
      audience: process.env.BETTER_AUTH_URL,
      algorithms: ["EdDSA"],
    });

    // Find user from database
    const query = {
      _id: new ObjectId(payload.sub),
    };

    const user = await users.findOne(query);

    if (!user) {
      return res.status(401).send({
        message: "User not found",
      });
    }

    // Check blocked user
    if (user.isBlocked === true) {
      return res.status(403).send({
        message: "Your account is blocked",
      });
    }

    req.user = user;

    next();

  } catch (error) {
    console.error("Token verification failed:", error);

    return res.status(401).send({
      message: "Unauthorized",
    });
  }
};



// Role Verification Middleware


const verifyVendor = (req, res, next) => {
  if (req.user.role !== "vendor") {
    return res.status(403).send({
      message: "Forbidden access",
    });
  }

  next();
};

const verifyCustomer = (req, res, next) => {
  if (req.user.role !== "customer") {
    return res.status(403).send({
      message: "Forbidden access",
    });
  }

  next();
};

const verifyAdmin = (req, res, next) => {
  if (req.user.role !== "admin") {
    return res.status(403).send({
      message: "Forbidden access",
    });
  }

  next();
};



// Test Route


app.get("/", (req, res) => {
  res.send("EverVow is looping");
});



// Users Related APIs


// Only Admin can see all users
app.get("/users", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await users.find({}).toArray();
    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch users",
    });
  }
});



// Services Related APIs


// Get all approved and active services
app.get("/services", async (req, res) => {
  try {
    const query = {
      status: "approved",
      isActive: true,
    };

    const result = await services.find(query).toArray();

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch services",
    });
  }
});




// Get single service details
app.get("/services/:id", async (req, res) => {
  try {
    const id = req.params.id;

    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid service ID",
      });
    }

    const query = {
      _id: new ObjectId(id),
      status: "approved",
      isActive: true,
    };

    const result = await services.findOne(query);

    if (!result) {
      return res.status(404).send({
        message: "Service not found",
      });
    }

    res.send(result);
  } catch (error) {
    res.status(500).send({
      message: "Failed to fetch service details",
    });
  }
});




// Add new service (Vendor only)
app.post("/services", verifyToken, verifyVendor, async (req, res) => {
  try {
    const {
      serviceName,
      category,
      description,
      price,
      location,
      images,
    } = req.body;

    // Validate required fields
    if (
      !serviceName?.trim() ||
      !category?.trim() ||
      !description?.trim() ||
      price === undefined ||
      !location?.trim() ||
      !Array.isArray(images) ||
      images.length === 0
    ) {
      return res.status(400).send({
        message: "Please provide all required service information",
      });
    }

    // Validate price
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) {
      return res.status(400).send({
        message: "Please provide a valid price",
      });
    }

    // Validate images
    if (!images.every((image) => typeof image === "string" && image.trim())) {
      return res.status(400).send({
        message: "Please provide valid image URLs",
      });
    }

    const newService = {
      vendorId: req.user._id.toString(),
      vendorName: req.user.name,
      vendorEmail: req.user.email,

      serviceName: serviceName.trim(),
      category: category.trim(),
      description: description.trim(),
      price: Number(price),
      location: location.trim(),
      images,

      status: "pending",
      isActive: true,

      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const result = await services.insertOne(newService);

    res.status(201).send({
      message: "Service submitted successfully. Waiting for admin approval.",
      insertedId: result.insertedId,
    });

  } catch (error) {
    console.error("Add service error:", error);

    res.status(500).send({
      message: "Failed to add service",
    });
  }
});





// Get Vendor's own services
app.get("/my-services", verifyToken, verifyVendor, async (req, res) => {
  try {
    const query = {
      vendorId: req.user._id.toString(),
    };

    const result = await services
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Get my services error:", error);

    res.status(500).send({
      message: "Failed to fetch your services",
    });
  }
});






// Update Vendor's service
app.put("/services/:id", verifyToken, verifyVendor, async (req, res) => {
  try {
    const id = req.params.id;

    // Validate service ID
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({
        message: "Invalid service ID",
      });
    }

    // Find service
    const query = {
      _id: new ObjectId(id),
      vendorId: req.user._id.toString(),
    };

    const service = await services.findOne(query);

    if (!service) {
      return res.status(404).send({
        message: "Service not found",
      });
    }

    const {
      serviceName,
      category,
      description,
      price,
      location,
      images,
    } = req.body;

    // Validate required fields
    if (
      !serviceName?.trim() ||
      !category?.trim() ||
      !description?.trim() ||
      price === undefined ||
      !location?.trim() ||
      !Array.isArray(images) ||
      images.length === 0
    ) {
      return res.status(400).send({
        message: "Please provide all required service information",
      });
    }

    // Validate price
    if (!Number.isFinite(Number(price)) || Number(price) <= 0) {
      return res.status(400).send({
        message: "Please provide a valid price",
      });
    }

    // Validate images
    if (!images.every((image) => typeof image === "string" && image.trim())) {
      return res.status(400).send({
        message: "Please provide valid image URLs",
      });
    }

    const updatedService = {
      serviceName: serviceName.trim(),
      category: category.trim(),
      description: description.trim(),
      price: Number(price),
      location: location.trim(),
      images,
      status: "pending",
      updatedAt: new Date(),
    };

    const result = await services.updateOne(query, {
      $set: updatedService,
    });

    res.send({
      message: "Service updated successfully. Waiting for admin approval.",
      modifiedCount: result.modifiedCount,
    });
  } catch (error) {
    console.error("Update service error:", error);

    res.status(500).send({
      message: "Failed to update service",
    });
  }
});







// Delete Vendor's service
app.delete("/services/:id", verifyToken, verifyVendor, async (req, res) => {
  try {
    const id = req.params.id;

    // Check whether the ID is valid
    if (!ObjectId.isValid(id)) {
      return res.status(400).send({ message: "Invalid service ID" });
    }

    // Find only the service owned by the logged-in vendor
    const query = {
      _id: new ObjectId(id),
      vendorId: req.user._id.toString(),
    };

    const result = await services.deleteOne(query);

    if (result.deletedCount === 0) {
      return res.status(404).send({ message: "Service not found" });
    }

    res.send({
      message: "Service deleted successfully",
      deletedCount: result.deletedCount,
    });
  } catch (error) {
    console.error("Delete service error:", error);
    res.status(500).send({ message: "Failed to delete service" });
  }
});







// Update Vendor's service availability
app.patch(
  "/services/:id/availability",
  verifyToken,
  verifyVendor,
  async (req, res) => {
    try {
      const id = req.params.id;
      const { isActive } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({ message: "Invalid service ID" });
      }

      if (typeof isActive !== "boolean") {
        return res.status(400).send({
          message: "isActive must be true or false",
        });
      }

      const query = {
        _id: new ObjectId(id),
        vendorId: req.user._id.toString(),
      };

      const result = await services.updateOne(query, {
        $set: {
          isActive,
          updatedAt: new Date(),
        },
      });

      if (result.matchedCount === 0) {
        return res.status(404).send({ message: "Service not found" });
      }

      res.send({
        message: `Service ${isActive ? "activated" : "deactivated"} successfully`,
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("Availability update error:", error);
      res.status(500).send({
        message: "Failed to update service availability",
      });
    }
  }
);







app.get("/protected", verifyToken, (req, res) => {
  res.send({
    message: "JWT verification successful!",
    user: {
      name: req.user.name,
      email: req.user.email,
      role: req.user.role,
    },
  });
});

// Customer test
app.get("/customer-test", verifyToken, verifyCustomer, (req, res) => {
  res.send({ message: "Customer access successful!" });
});

// Vendor test
app.get("/vendor-test", verifyToken, verifyVendor, (req, res) => {
  res.send({ message: "Vendor access successful!" });
});

// Admin test
app.get("/admin-test", verifyToken, verifyAdmin, (req, res) => {
  res.send({ message: "Admin access successful!" });
});





 // Create Customer Booking
app.post("/bookings", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const { serviceId, eventDate, eventLocation, message } = req.body;

    if (
      !serviceId ||
      !eventDate ||
      !eventLocation?.trim()
    ) {
      return res.status(400).send({
        message: "Please provide all required booking information",
      });
    }

    if (!ObjectId.isValid(serviceId)) {
      return res.status(400).send({
        message: "Invalid service ID",
      });
    }

    const selectedDate = new Date(eventDate);

    if (Number.isNaN(selectedDate.getTime())) {
      return res.status(400).send({
        message: "Please provide a valid event date",
      });
    }

    // Find an approved and active service
    const service = await services.findOne({
      _id: new ObjectId(serviceId),
      status: "approved",
      isActive: true,
    });

    if (!service) {
      return res.status(404).send({
        message: "Service not found or unavailable",
      });
    }

    // Prevent vendors from booking their own services
    if (service.vendorId === req.user._id.toString()) {
      return res.status(403).send({
        message: "You cannot book your own service",
      });
    }

    // Prevent duplicate active bookings for the same date
    const existingBooking = await bookings.findOne({
      serviceId: service._id.toString(),
      customerId: req.user._id.toString(),
      eventDate: selectedDate,
      status: { $in: ["pending", "accepted"] },
    });

    if (existingBooking) {
      return res.status(409).send({
        message: "You already have an active booking for this service and date",
      });
    }

    const booking = {
      serviceId: service._id.toString(),
      serviceName: service.serviceName,
      vendorId: service.vendorId,
      vendorName: service.vendorName,
      customerId: req.user._id.toString(),
      customerName: req.user.name,
      customerEmail: req.user.email,
      eventDate: selectedDate,
      eventLocation: eventLocation.trim(),
      message: message?.trim() || "",
      status: "pending",
      createdAt: new Date(),
    };

    const result = await bookings.insertOne(booking);

    res.status(201).send({
      message: "Booking request submitted successfully",
      insertedId: result.insertedId,
    });
  } catch (error) {
    console.error("Create booking error:", error);
    res.status(500).send({
      message: "Failed to create booking",
    });
  }
});






// Get Customer's Bookings
app.get("/my-bookings", verifyToken, verifyCustomer, async (req, res) => {
  try {
    const query = {
      customerId: req.user._id.toString(),
    };

    const result = await bookings
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Get my bookings error:", error);
    res.status(500).send({
      message: "Failed to fetch your bookings",
    });
  }
});





// Cancel Customer's Booking
app.patch(
  "/bookings/:id/cancel",
  verifyToken,
  verifyCustomer,
  async (req, res) => {
    try {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid booking ID",
        });
      }

      const query = {
        _id: new ObjectId(id),
        customerId: req.user._id.toString(),
        status: "pending",
      };

      const result = await bookings.updateOne(query, {
        $set: {
          status: "cancelled",
          updatedAt: new Date(),
        },
      });

      if (result.matchedCount === 0) {
        return res.status(404).send({
          message: "Pending booking not found",
        });
      }

      res.send({
        message: "Booking cancelled successfully",
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("Cancel booking error:", error);
      res.status(500).send({
        message: "Failed to cancel booking",
      });
    }
  }
);







 // Get Vendor's Booking Requests
app.get("/vendor-bookings", verifyToken, verifyVendor, async (req, res) => {
  try {
    const query = {
      vendorId: req.user._id.toString(),
    };

    const result = await bookings
      .find(query)
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Get vendor bookings error:", error);
    res.status(500).send({
      message: "Failed to fetch booking requests",
    });
  }
});




 // Update Booking Status by Vendor
app.patch(
  "/bookings/:id/status",
  verifyToken,
  verifyVendor,
  async (req, res) => {
    try {
      const id = req.params.id;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid booking ID",
        });
      }

      if (!["accepted", "rejected"].includes(status)) {
        return res.status(400).send({
          message: "Status must be accepted or rejected",
        });
      }

      const query = {
        _id: new ObjectId(id),
        vendorId: req.user._id.toString(),
        status: "pending",
      };

      const result = await bookings.updateOne(query, {
        $set: {
          status,
          updatedAt: new Date(),
        },
      });

      if (result.matchedCount === 0) {
        return res.status(404).send({
          message: "Pending booking not found",
        });
      }

      res.send({
        message: `Booking ${status} successfully`,
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("Update booking status error:", error);
      res.status(500).send({
        message: "Failed to update booking status",
      });
    }
  }
);








 // Get All Services for Admin
app.get("/admin/services", verifyToken, verifyAdmin, async (req, res) => {
  try {
    const result = await services
      .find({})
      .sort({ createdAt: -1 })
      .toArray();

    res.send(result);
  } catch (error) {
    console.error("Get all services error:", error);
    res.status(500).send({
      message: "Failed to fetch services",
    });
  }
});




 // Approve or Reject Service by Admin
app.patch(
  "/admin/services/:id/status",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const id = req.params.id;
      const { status } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid service ID",
        });
      }

      if (!["approved", "rejected"].includes(status)) {
        return res.status(400).send({
          message: "Status must be approved or rejected",
        });
      }

      const query = {
        _id: new ObjectId(id),
        status: "pending",
      };

      const result = await services.updateOne(query, {
        $set: {
          status,
          updatedAt: new Date(),
        },
      });

      if (result.matchedCount === 0) {
        return res.status(404).send({
          message: "Pending service not found",
        });
      }

      res.send({
        message: `Service ${status} successfully`,
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("Service approval error:", error);
      res.status(500).send({
        message: "Failed to update service status",
      });
    }
  }
);





 // Update Service Availability by Admin
app.patch(
  "/admin/services/:id/availability",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const id = req.params.id;
      const { isActive } = req.body;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid service ID",
        });
      }

      if (typeof isActive !== "boolean") {
        return res.status(400).send({
          message: "isActive must be true or false",
        });
      }

      const result = await services.updateOne(
        { _id: new ObjectId(id) },
        {
          $set: {
            isActive,
            updatedAt: new Date(),
          },
        }
      );

      if (result.matchedCount === 0) {
        return res.status(404).send({
          message: "Service not found",
        });
      }

      res.send({
        message: `Service ${isActive ? "activated" : "deactivated"} successfully`,
        modifiedCount: result.modifiedCount,
      });
    } catch (error) {
      console.error("Admin availability update error:", error);
      res.status(500).send({
        message: "Failed to update service availability",
      });
    }
  }
);





 // Delete Service by Admin
app.delete(
  "/admin/services/:id",
  verifyToken,
  verifyAdmin,
  async (req, res) => {
    try {
      const id = req.params.id;

      if (!ObjectId.isValid(id)) {
        return res.status(400).send({
          message: "Invalid service ID",
        });
      }

      const result = await services.deleteOne({
        _id: new ObjectId(id),
      });

      if (result.deletedCount === 0) {
        return res.status(404).send({
          message: "Service not found",
        });
      }

      res.send({
        message: "Service deleted successfully",
        deletedCount: result.deletedCount,
      });
    } catch (error) {
      console.error("Admin delete service error:", error);
      res.status(500).send({
        message: "Failed to delete service",
      });
    }
  }
);



app.listen(port, () => {
  console.log(`EverVow server is running on port ${port}`);
});

export default app;
