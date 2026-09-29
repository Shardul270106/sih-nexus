/**
 * Seed script — creates demo admin user + facility layer
 * Usage: node scripts/seed.mjs
 */
import 'dotenv/config';
import mongoose from 'mongoose';
import bcrypt from 'bcrypt';

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/agni_drishti';

const FACILITIES = [
  { name: 'Reliance Industries Jamnagar Refinery', type: 'Refinery', coordinates: [70.0620, 22.3896], state: 'Gujarat', criticality: 'High', detectability: 'High', operator: 'Reliance Industries', source: 'GEM' },
  { name: 'Bharat Petroleum Refinery Mumbai', type: 'Refinery', coordinates: [72.8777, 19.0760], state: 'Maharashtra', criticality: 'High', detectability: 'Moderate_High', operator: 'BPCL', source: 'Manual' },
  { name: 'Jharia Coalfield Zone', type: 'Coal_Mine', coordinates: [86.4383, 23.7500], state: 'Jharkhand', criticality: 'High', detectability: 'High', operator: 'Bharat Coking Coal Ltd', source: 'Manual' },
  { name: 'Bhilai Steel Plant', type: 'Steel_Plant', coordinates: [81.3808, 21.2158], state: 'Chhattisgarh', criticality: 'High', detectability: 'Moderate_High', operator: 'SAIL', source: 'OSM' },
  { name: 'Rourkela Steel Plant', type: 'Steel_Plant', coordinates: [84.8609, 22.2270], state: 'Odisha', criticality: 'High', detectability: 'Moderate_High', operator: 'SAIL', source: 'OSM' },
  { name: 'Bhalswa Landfill Delhi', type: 'Landfill', coordinates: [77.1807, 28.7305], state: 'Delhi', criticality: 'Medium', detectability: 'Moderate', operator: 'EDMC', source: 'OSM' },
  { name: 'Ghazipur Landfill Delhi', type: 'Landfill', coordinates: [77.3275, 28.6236], state: 'Delhi', criticality: 'Medium', detectability: 'Moderate', operator: 'EDMC', source: 'OSM' },
  { name: 'Vizag Refinery HPCL', type: 'Refinery', coordinates: [83.2985, 17.6999], state: 'Andhra Pradesh', criticality: 'High', detectability: 'High', operator: 'HPCL', source: 'OSM' },
  { name: 'NTPC Korba Thermal Power Plant', type: 'Thermal_Power_Plant', coordinates: [82.7501, 22.3595], state: 'Chhattisgarh', criticality: 'High', detectability: 'Low', operator: 'NTPC', source: 'GEM' },
  { name: 'Mumbai High Offshore Platforms', type: 'Gas_Flare', coordinates: [72.5000, 19.0700], state: 'Maharashtra', criticality: 'High', detectability: 'High', operator: 'ONGC', source: 'Manual' },
  { name: 'Durgapur Steel Plant', type: 'Steel_Plant', coordinates: [87.3119, 23.4800], state: 'West Bengal', criticality: 'High', detectability: 'Moderate_High', operator: 'SAIL', source: 'OSM' },
  { name: 'Bokaro Steel Plant', type: 'Steel_Plant', coordinates: [86.1505, 23.6693], state: 'Jharkhand', criticality: 'High', detectability: 'Moderate_High', operator: 'SAIL', source: 'OSM' },
  { name: 'Mathura Refinery IOCL', type: 'Refinery', coordinates: [77.5320, 27.4920], state: 'Uttar Pradesh', criticality: 'High', detectability: 'High', operator: 'IOCL', source: 'GEM' },
  { name: 'Panipat Refinery IOCL', type: 'Refinery', coordinates: [76.9770, 29.3930], state: 'Haryana', criticality: 'High', detectability: 'High', operator: 'IOCL', source: 'GEM' },
  { name: 'Tuticorin Thermal Power Station', type: 'Thermal_Power_Plant', coordinates: [78.1520, 8.7940], state: 'Tamil Nadu', criticality: 'Medium', detectability: 'Low', operator: 'TANGEDCO', source: 'GEM' },
  { name: 'Ramagundam Fertilizers and Chemicals', type: 'Fertilizer', coordinates: [79.4740, 18.7550], state: 'Telangana', criticality: 'Medium', detectability: 'Moderate', operator: 'RFCL', source: 'GEM' },
  { name: 'Barren Island Volcano', type: 'Other_Industrial', coordinates: [93.8580, 12.2780], state: 'Andaman and Nicobar', criticality: 'Low', detectability: 'High', operator: 'Natural', source: 'Manual', notes: 'Active volcano — Natural_Static class reference site' },
];

async function seed() {
  await mongoose.connect(MONGO_URI);
  console.log(`Connected to ${MONGO_URI}`);

  // ── Users ──────────────────────────────────────────────────────
  const users = mongoose.connection.collection('users');
  const adminEmail = 'admin@ntro.gov.in';
  if (await users.findOne({ email: adminEmail })) {
    console.log('✔ Demo admin already exists');
  } else {
    const hash = await bcrypt.hash('Admin@123', 12);
    await users.insertOne({
      name: 'Demo Admin',
      email: adminEmail,
      password: hash,
      role: 'admin',
      is_active: true,
      login_count: 0,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    console.log(`✔ Created admin: ${adminEmail} / Admin@123`);
  }

  // ── Facilities ─────────────────────────────────────────────────
  const facilities = mongoose.connection.collection('facilities');
  const count = await facilities.countDocuments();
  if (count > 0) {
    console.log(`✔ ${count} facilities already present, skipping facility seed`);
  } else {
    const now = new Date();
    const docs = FACILITIES.map((f) => ({
      name: f.name,
      type: f.type,
      location: { type: 'Point', coordinates: f.coordinates },
      state: f.state,
      criticality: f.criticality,
      detectability: f.detectability,
      operator: f.operator,
      source: f.source,
      status: 'Active',
      is_sensitive: false,
      notes: f.notes || '',
      createdAt: now,
      updatedAt: now,
    }));
    const res = await facilities.insertMany(docs);
    console.log(`✔ Seeded ${res.insertedIds ? Object.keys(res.insertedIds).length : docs.length} facilities`);
  }

  await mongoose.disconnect();
  console.log('Seed complete.');
}

seed().catch((e) => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
