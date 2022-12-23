const express = require("express");
const { MongoClient, ServerApiVersion, ObjectId } = require("mongodb");
const cors = require("cors");
const jwt = require("jsonwebtoken");
require("dotenv").config();
const stripe = require("stripe")(process.env.STRIPE_SK);
const nodemailer = require("nodemailer");
const sgMail = require('@sendgrid/mail')
const port = process.env.PORT || 5000;
const app = express();

// middle wears
//

// 


app.use(cors());
app.use(express.json());

const verifyJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) {
    return res.status(401).send("unAuthorized");
  }
  const token = authHeader.split(" ")[1];
  jwt.verify(token, process.env.ACCESS_TOKEN, (err, decoded) => {
    if (err) {
      return res.status(403).send({ massage: "forbidden access" });
    }
    req.decoded = decoded;
    next();
  });
};

app.get("/", (req, res) => {
  res.send("backend is working");
});

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.rdtrwss.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  serverApi: ServerApiVersion.v1,
});
const sendEmail = (booking) => {
  const { bookingDate, treatment, patient, slot, email, phone, price } =
    booking;

  
 
  sgMail.setApiKey(process.env.SENDGRID_API_KEY)
const msg = {
  to: email, // Change to your recipient
  from: "md.rifat.taluckdar@gmail.com", // Change to your verified sender
  subject: `Appointment for ${treatment} is confirmed`, // Subject line
  text: "Hello world!", // plain text body
  html: `
  <h2>Your appointment is confirmed ${treatment}</h2>
  <div>
  <p>Your appointment for ${treatment}</p>
  <p>Please visit us on ${bookingDate} at ${slot}</p>
  <p>Thanks for Doctors Portal</p>
  </div>
  `, 
}
sgMail
  .send(msg)
  .then(() => {
    console.log('Email sent')
  })
  .catch((error) => {
    console.error(error)
  })
  // let transporter = nodemailer.createTransport({
  //   host: "smtp.sendgrid.net",
  //   port: 587,
  //   auth: {
  //     user: "apikey",
  //     pass: process.env.SENDGRID_API_KEY,
  //   },
  // });
  // transporter.sendMail(
  //   {
  //     from: "support@doctors-portal.com", // verified sender email
  //     to: email, // recipient email
  //     subject: `Appointment for ${treatment} is confirmed`, // Subject line
  //     text: "Hello world!", // plain text body
  //     html: `
  //     <h2>Your appointment is confirmed ${treatment}</h2>
  //     <div>
  //     <p>Your appointment for ${treatment}</p>
  //     <p>Please visit us on ${bookingDate} at ${slot}</p>
  //     <p>Thanks for Doctors Portal</p>
  //     </div>
  //     `, // html body
  //   },
  //   function (error, info) {
  //     if (error) {
  //       console.log(error);
  //     } else {
  //       console.log("Email sent: " + info.response);
  //     }
  //   }
  // );
};

const run = async () => {
  try {
    const AppointmentOptionCollection = client
      .db("doctor-portal")
      .collection("Appointment-Option");
    const BookingCollection = client.db("doctor-portal").collection("Bookings");
    const UsersCollection = client.db("doctor-portal").collection("Users");
    const DoctorsCollection = client.db("doctor-portal").collection("Doctors");
    const PaymentCollection = client.db("doctor-portal").collection("Payment");

    const verifyAdmin = async (req, res, next) => {
      const decodedEmail = req.decoded.email;
      const query = { email: decodedEmail };
      const user = await UsersCollection.findOne(query);
      if (user?.role !== "admin") {
        return res.status(403).send({ massage: "forbidden access" });
      }
      next();
    };

    app.get("/appointment", async (req, res) => {
      const date = req.query.date;
      console.log(date);
      const appointments = await AppointmentOptionCollection.find({}).toArray();
      const query = { bookingDate: date };
      const booked = await BookingCollection.find(query).toArray();
      appointments.forEach((appointment) => {
        const appointmentBooked = booked.filter(
          (book) => book.treatment === appointment.name
        );
        const bookSlots = appointmentBooked.map((book) => book.slot);
        const remainingSlots = appointment.slots.filter(
          (slot) => !bookSlots.includes(slot)
        );
        appointment.slots = remainingSlots;
      });
      res.send(appointments);
    });
    app.get("/appointment/Specialty", async (req, res) => {
      const appointmentsName = await AppointmentOptionCollection.find({})
        .project({ name: 1 })
        .toArray();
      res.send(appointmentsName);
    });
    app.get("/v2/appointment", async (req, res) => {
      const date = req.query.date;
      const appointments = await AppointmentOptionCollection.aggregate([
        {
          $lookup: {
            from: "Bookings",
            localField: "name",
            foreignField: "treatment",
            pipeline: [
              {
                $match: {
                  $expr: {
                    $eq: ["$bookingDate", date],
                  },
                },
              },
            ],
            as: "booked",
          },
        },
        {
          $project: {
            name: 1,
            price: 1,
            slots: 1,
            booked: {
              $map: {
                input: "$booked",
                as: "book",
                in: "$$book.slot",
              },
            },
          },
        },
        {
          $project: {
            name: 1,
            price: 1,
            slots: {
              $setDifference: ["$slots", "$booked"],
            },
          },
        },
      ]).toArray();
      res.send(appointments);
    });

    // Bookings
    app.get("/bookings", verifyJWT, async (req, res) => {
      const email = req.query.email;
      const decodedEmail = req.decoded.email;
      const query = {
        email: email,
      };
      if (decodedEmail !== email) {
        return res.status(403).send({ massage: "forbidden access" });
      }
      const bookings = await BookingCollection.find(query).toArray();
      res.send(bookings);
    });
    app.get("/bookings/:id", async (req, res) => {
      const id = req.params.id;
      const query = {
        _id: ObjectId(id),
      };
      const booking = await BookingCollection.findOne(query);
      res.send(booking);
    });

    app.post("/bookings", async (req, res) => {
      const booking = req.body;
      const query = {
        bookingDate: booking.bookingDate,
        treatment: booking.treatment,
        email: booking.email,
      };
      const alreadyBooked = await BookingCollection.find(query).toArray();
      if (alreadyBooked.length) {
        return res.send({ acknowledged: false });
      }
      const result = await BookingCollection.insertOne(booking);
      // send booking email
      sendEmail(booking);
      res.send(result);
    });

    // users
    app.post("/users", async (req, res) => {
      const user = req.body;
      const result = await UsersCollection.insertOne(user);
      res.send(result);
    });
    app.get("/users", async (req, res) => {
      const users = await UsersCollection.find({}).toArray();
      res.send(users);
    });
    app.get("/users/admin/:email", async (req, res) => {
      const email = req.params.email;
      const query = { email: email };
      const user = await UsersCollection.findOne(query);
      res.send({ isAdmin: user?.role === "admin" });
    });
    app.put("/users/admin/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const filter = { _id: ObjectId(id) };
      const options = { upsert: true };
      const updateDoc = {
        $set: {
          role: "admin",
        },
      };
      const result = await UsersCollection.updateOne(
        filter,
        updateDoc,
        options
      );
      res.send(result);
    });
    // app.get("/price",  async (req, res) => {
    //   const filter = {};
    //   const options = { upsert: true };
    //   const updateDoc = {
    //     $set: {
    //       price: 99,
    //     },
    //   };
    //   const result = await AppointmentOptionCollection.updateMany(
    //     filter,
    //     updateDoc,
    //     options
    //   );
    //   res.send(result);
    // });

    app.post("/create-payment-intent", async (req, res) => {
      const booking = req.body;
      const price = booking.price;
      const amount = price * 100;
      const paymentIntent = await stripe.paymentIntents.create({
        amount: amount,
        currency: "usd",
        payment_method_types: ["card"],
      });

      res.send({
        clientSecret: paymentIntent.client_secret,
      });
    });

    app.get("/jwt", async (req, res) => {
      const email = req.query.email;
      const query = {
        email: email,
      };
      const user = await UsersCollection.find(query);
      if (user) {
        const token = jwt.sign({ email }, process.env.ACCESS_TOKEN, {
          expiresIn: "1d",
        });
        return res.send({ accessToken: token });
      }
      res.status(401).send({ accessToken: "" });
    });

    app.get("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const result = await DoctorsCollection.find({}).toArray();
      res.send(result);
    });
    app.post("/doctors", verifyJWT, verifyAdmin, async (req, res) => {
      const user = req.body;
      const result = await DoctorsCollection.insertOne(user);
      res.send(result);
    });
    app.delete("/doctors/:id", verifyJWT, verifyAdmin, async (req, res) => {
      const id = req.params.id;
      const query = { _id: ObjectId(id) };
      const result = await DoctorsCollection.deleteOne(query);
      res.send(result);
    });
    app.post("/payment", async (req, res) => {
      const payment = req.body;
      console.log(payment);
      const result = await PaymentCollection.insertOne(payment);
      const id = payment.bookingId;
      const filter = { _id: ObjectId(id) };
      const updateDoc = {
        $set: {
          paid: true,
          transactionId: payment.transactionId,
        },
      };
      const update = await BookingCollection.updateOne(filter, updateDoc);
      res.send(result);
    });
  } finally {
  }
};
run().catch(console.dir);

app.listen(port, () => console.log(`server is running on ${port}`));
