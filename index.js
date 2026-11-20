import express from "express";
import cors from "cors";
import "dotenv/config";
import { MongoClient, ObjectId } from "mongodb";
import dns from "node:dns";
import { jwt } from "better-auth/plugins";
import { jwtVerify, createRemoteJWKSet } from "jose";

dns.setServers(["1.1.1.1"]);

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

const JWKS = createRemoteJWKSet(
  new URL("/api/auth/jwks", process.env.BETTER_AUTH_URL)
);

// MongoDB connection
const client =   new MongoClient(`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.w23gcv8.mongodb.net/`);


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

// collections
const users = database.collection("user");
const services = database.collection("services");
// const bookings = database.collection("bookings");
// const transactions = database.collection("transactions");




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
    const query = { _id: payload.sub };
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





// app.get("/protected", verifyToken, (req, res) => {
//   res.send({
//     message: "JWT verification successful!",
//     user: req.user,
//   });
// });


// logger
// const myLogger = (req, res, next) => {
//   console.log("Now hitting API:", req.method, req.url);
//   next();
// };

// app.use(myLogger);

// test route
app.get('/', (req, res) => {
  res.send('EverVow is looping')
})

app.get('/users', async(req,res) => {
  const cursor = users.find({})
  const result = await cursor.toArray()
  res.send(result)
})

// API routes will go here

app.listen(port, () => {
  console.log(`EverVow server is running on port ${port}`);
});

export default app;