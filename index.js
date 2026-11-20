import express from "express";
import cors from "cors";
import "dotenv/config";
// import { MongoClient, ObjectId } from "mongodb";
import dns from "node:dns";

dns.setServers(["1.1.1.1"]);

const app = express();
const port = process.env.PORT || 5000;

// middleware
app.use(express.json());
app.use(cors());

// MongoDB connection
// const client =   new MongoClient(`mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASSWORD}@cluster0.w23gcv8.mongodb.net/`);


// export async function connectToMongoDB() {
//   try {
//     await client.connect();
//     console.log("You successfully connected to MongoDB!");
//     return client;
//   } catch (err) {
//     console.error("MongoDB connection failed:", err);
//     throw err;
//   }
// }

// const connectedClient = await connectToMongoDB();
// const database = connectedClient.db("weddingplan");

// collections
// const users = database.collection("user");
const services = database.collection("services");
// const bookings = database.collection("bookings");
// const transactions = database.collection("transactions");

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