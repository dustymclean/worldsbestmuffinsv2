import express from "express";
import { createServer as createViteServer } from "vite";
import { createClient } from "@supabase/supabase-js";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";
import dotenv from "dotenv";
import multer from "multer";
import fs from "fs";
import session from "express-session";
import cookieParser from "cookie-parser";
import { GoogleGenAI, Type } from "@google/genai";

declare module "express-session" {
  interface SessionData {
    isAdmin: boolean;
  }
}

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("muffins.db");

// Initialize Gemini
const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
const model = "gemini-3.1-pro-preview";

// Ensure uploads directory exists
const uploadsDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir);
}

// Configure multer for file uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, uniqueSuffix + path.extname(file.originalname));
  },
});
const upload = multer({ storage });

// Initialize local database
db.exec(`
  CREATE TABLE IF NOT EXISTS products (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    long_description TEXT,
    ingredients TEXT,
    benefits TEXT,
    price TEXT,
    image TEXT,
    link TEXT,
    category TEXT,
    variants TEXT
  )
`);

try {
  db.exec("ALTER TABLE products ADD COLUMN variants TEXT");
} catch (e) {
  // Column already exists
}

db.exec(`
  CREATE TABLE IF NOT EXISTS clients (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    email TEXT UNIQUE,
    phone TEXT,
    address TEXT,
    payment_method TEXT,
    source TEXT,
    uninfused BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    customer_name TEXT,
    customer_email TEXT,
    customer_phone TEXT,
    customer_address TEXT,
    order_details TEXT,
    total_amount TEXT,
    status TEXT DEFAULT 'pending',
    uninfused BOOLEAN DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

db.exec(`
  CREATE TABLE IF NOT EXISTS newsletter (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT UNIQUE,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_ANON_KEY || "";
// Safely initialize the client ONLY if we have variables (prevents server crash)
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null as any;

const INITIAL_PRODUCTS = [
  {
    id: "blueberry-muffin-2-pack",
    name: "Blueberry Muffin 2-Pack",
    description: "Fresh baked gourmet blueberry muffins, infused for a perfect morning.",
    long_description: "Our Artisan Blueberry Muffins are bursting with plump, organic blueberries and topped with a delicate sugar crumble. Infused with our signature full-spectrum hemp extract. We use a 24-hour slow-rise process to ensure a light, airy texture.",
    ingredients: "Organic Wheat Flour, Fresh Blueberries, Cane Sugar, Grass-fed Butter, Farm-fresh Eggs, Full-Spectrum Hemp Extract, Leavening Agents, Sea Salt.",
    benefits: "Promotes morning clarity and provides sustained energy.",
    price: "$15.00 – $25.00",
    variants: [
      { name: "100mg", price: "$15.00" },
      { name: "200mg", price: "$25.00" }
    ],
    image: "https://images.unsplash.com/photo-1607958996333-41aef7caefaa?auto=format&fit=crop&q=80&w=800",
    link: "https://pixies-pantry.com/product/pixies-pantry-artisan-blueberry-muffins-2-pack-fresh-baked-gourmet-breakfast-pastries/",
    category: "Pastries"
  },
  {
    id: "banana-nut-muffin-2-pack",
    name: "Banana Nut Muffin 2-Pack",
    description: "Full spectrum infused banana nut goodness with a crunchy topping.",
    long_description: "A classic favorite reimagined. Our Banana Nut Muffins feature overripe organic bananas for natural sweetness and premium California walnuts for a satisfying crunch. The full-spectrum infusion is seamlessly integrated into the batter.",
    ingredients: "Organic Bananas, Walnuts, Spelt Flour, Maple Syrup, Coconut Oil, Full-Spectrum Hemp Extract, Vanilla Bean, Cinnamon, Nutmeg.",
    benefits: "Rich in potassium and healthy fats, supports relaxation.",
    price: "$15.00 – $25.00",
    variants: [
      { name: "100mg", price: "$15.00" },
      { name: "200mg", price: "$25.00" }
    ],
    image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&q=80&w=800",
    link: "https://pixies-pantry.com/product/banana-nut-muffins-full-spectrum-infused/",
    category: "Pastries"
  },
  {
    id: "blueberry-muffin-dozen",
    name: "Blueberry Muffin Dozen",
    description: "A full dozen of our signature infused blueberry muffins.",
    long_description: "Perfect for sharing or stocking up. A full dozen of our artisan blueberry muffins, each infused with premium full-spectrum extract.",
    ingredients: "Organic Wheat Flour, Fresh Blueberries, Cane Sugar, Grass-fed Butter, Farm-fresh Eggs, Full-Spectrum Hemp Extract, Leavening Agents, Sea Salt.",
    benefits: "Best value for daily wellness support.",
    price: "$90.00 – $130.00",
    variants: [
      { name: "100mg", price: "$90.00" },
      { name: "200mg", price: "$130.00" }
    ],
    image: "https://images.unsplash.com/photo-1607958996333-41aef7caefaa?auto=format&fit=crop&q=80&w=800",
    link: "https://pixies-pantry.com/product/pixies-pantry-artisan-blueberry-muffins-2-pack-fresh-baked-gourmet-breakfast-pastries/",
    category: "Pastries"
  },
  {
    id: "banana-nut-muffin-dozen",
    name: "Banana Nut Muffin Dozen",
    description: "A full dozen of our signature infused banana nut muffins.",
    long_description: "Our famous banana nut muffins in a bulk dozen. Perfect for events or consistent wellness routines.",
    ingredients: "Organic Bananas, Walnuts, Spelt Flour, Maple Syrup, Coconut Oil, Full-Spectrum Hemp Extract, Vanilla Bean, Cinnamon, Nutmeg.",
    benefits: "Satisfies sweet cravings naturally while supporting relaxation.",
    price: "$90.00 – $130.00",
    variants: [
      { name: "100mg", price: "$90.00" },
      { name: "200mg", price: "$130.00" }
    ],
    image: "https://images.unsplash.com/photo-1558961363-fa8fdf82db35?auto=format&fit=crop&q=80&w=800",
    link: "https://pixies-pantry.com/product/banana-nut-muffins-full-spectrum-infused/",
    category: "Pastries"
  },
  {
    id: "pb-cookies",
    name: "Peanut Butter Cookies",
    description: "Soft, chewy, and perfectly infused for a relaxing treat.",
    long_description: "These aren't your average peanut butter cookies. We use small-batch, stone-ground peanut butter and a hint of sea salt to create a flavor profile that is both nostalgic and sophisticated. The texture is perfectly chewy on the inside with a slight crisp on the edges. Infused with 25mg of full-spectrum extract per cookie.",
    ingredients: "Roasted Peanuts, Brown Sugar, Butter, Eggs, Vanilla, Full-Spectrum Hemp Extract, Baking Soda, Sea Salt.",
    benefits: "High protein snack, aids in evening wind-down, and provides a precise dose of wellness support.",
    price: "$15.00 – $20.00",
    variants: [
      { name: "100mg (4-Pack)", price: "$15.00" },
      { name: "200mg (4-Pack)", price: "$20.00" }
    ],
    image: "https://images.unsplash.com/photo-1590080875515-8a3a8dc5735e?auto=format&fit=crop&q=80&w=800",
    link: "https://pixies-pantry.com/product/peanut-butter-cookies-full-spectrum-infused/",
    category: "Cookies"
  },
  {
    id: "hazelnut-spread",
    name: "Infused Hazelnut Spread",
    description: "Rich, velvety hazelnut spread with a full spectrum infusion.",
    long_description: "Our Infused Hazelnut Spread is a decadent blend of roasted hazelnuts and premium cocoa, enhanced with our full-spectrum hemp extract. Perfect for spreading on toast, dipping fruit, or enjoying straight from the jar.",
    ingredients: "Roasted Hazelnuts, Cocoa Powder, Cane Sugar, Palm Oil (Sustainable), Full-Spectrum Hemp Extract, Vanilla, Sea Salt.",
    benefits: "Supports mood balance, provides healthy fats, and offers a luxurious way to enjoy your daily CBD.",
    price: "$30.00 – $40.00",
    variants: [
      { name: "500mg (4 oz)", price: "$30.00" },
      { name: "1000mg (4 oz)", price: "$40.00" }
    ],
    image: "https://images.unsplash.com/photo-1590505681226-06103447a9c4?auto=format&fit=crop&q=80&w=800",
    link: "https://pixies-pantry.com/product/infused-hazelnut-spread-full-spectrum/",
    category: "Spreads"
  },
  {
    id: "peanut-butter",
    name: "Infused Peanut Butter",
    description: "Creamy, small-batch peanut butter for the ultimate snack.",
    long_description: "Small-batch, stone-ground peanut butter infused with full-spectrum hemp. Our peanut butter is made with only the finest roasted peanuts and a touch of sea salt, ensuring a pure and delicious flavor.",
    ingredients: "Roasted Peanuts, Full-Spectrum Hemp Extract, Sea Salt.",
    benefits: "High protein, supports muscle recovery, and provides a convenient way to incorporate hemp into your diet.",
    price: "$30.00 – $40.00",
    variants: [
      { name: "500mg (4 oz)", price: "$30.00" },
      { name: "1000mg (4 oz)", price: "$40.00" }
    ],
    image: "https://images.unsplash.com/photo-1590505681226-06103447a9c4?auto=format&fit=crop&q=80&w=800",
    link: "https://pixies-pantry.com/product/infused-peanut-butter-full-spectrum/",
    category: "Spreads"
  },
  {
    id: "bundle-box",
    name: "Pixie's Bundle Box",
    description: "The ultimate collection of our signature cookies and muffins.",
    long_description: "Can't decide? The Pixie's Bundle Box is the perfect solution. This curated collection includes 2 Muffins (Variety/Seasonal) and 2 Cookies.",
    ingredients: "Various (See individual products for details).",
    benefits: "Great for gifting, allows you to try multiple products, and offers the best value for our premium infusions.",
    price: "$15.00 – $25.00",
    variants: [
      { name: "500mg Total", price: "$15.00" },
      { name: "1000mg Total", price: "$25.00" }
    ],
    image: "https://images.unsplash.com/photo-1516919549054-e08258825f80?auto=format&fit=crop&q=80&w=800",
    link: "https://pixies-pantry.com/product/pixies-pantry-full-spectrum-bundle-box/",
    category: "Bundles"
  },
  {
    id: "mct-oil",
    name: "Infused MCT Oil (Tincture)",
    description: "30ml of unflavored, hemp-derived MCT oil for versatile use.",
    long_description: "Our Infused MCT Oil (Tincture) is a versatile and potent way to enjoy the benefits of full-spectrum hemp. Unflavored and easy to use, it can be added to your favorite beverages or taken directly. Available in 1000mg and 3000mg strengths.",
    ingredients: "MCT Oil (from Coconut), Full-Spectrum Hemp Extract.",
    benefits: "Supports cognitive function, provides quick energy, and offers a highly bioavailable way to consume hemp extract.",
    price: "$20.00 – $40.00",
    variants: [
      { name: "1000mg", price: "$20.00" },
      { name: "3000mg", price: "$40.00" }
    ],
    image: "https://i.postimg.cc/mD8fXf9x/mct-oil.png",
    link: "https://pixies-pantry.com/product/hemp-derived-mct-oil-30ml-unflavored/",
    category: "Wellness"
  }
];

// Initialize settings table
db.exec(`
  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT
  )
`);

const DEFAULT_SETTINGS: Record<string, string> = {
  site_title: "The Whole Baked Machine",
  site_description: "Gourmet Infused Bakery & Wellness Collection",
  contact_email: "support@pixies-pantry.com",
  social_handle: "@pixieispantryshop"
};

const settingsCount = db.prepare("SELECT count(*) as count FROM settings").get() as { count: number };
if (settingsCount.count === 0) {
  const insert = db.prepare("INSERT INTO settings (key, value) VALUES (?, ?)");
  for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
    insert.run(key, value);
  }
}

// Seed local DB
const count = db.prepare("SELECT count(*) as count FROM products").get() as { count: number };
// Check for old IDs or missing new IDs to trigger re-seed
const hasOldMuffin = db.prepare("SELECT id FROM products WHERE id = 'blueberry-muffins'").get();
const hasNewMuffin = db.prepare("SELECT id FROM products WHERE id = 'blueberry-muffin-dozen'").get();

if (count.count === 0 || hasOldMuffin || !hasNewMuffin) {
  console.log("Seeding/Re-seeding products...");
  db.prepare("DELETE FROM products").run();
  const insert = db.prepare("INSERT INTO products (id, name, description, long_description, ingredients, benefits, price, image, link, category, variants) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)");
  for (const p of INITIAL_PRODUCTS) {
    insert.run(p.id, p.name, p.description, p.long_description, p.ingredients, p.benefits, p.price, p.image, p.link, p.category, p.variants ? JSON.stringify(p.variants) : null);
  }
}
// Removed the update sync logic that was overwriting user changes on restart

async function startServer() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());
  app.use(session({
    secret: process.env.SESSION_SECRET || "pantry-secret-key",
    resave: false,
    saveUninitialized: false,
    cookie: { 
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      httpOnly: true,
      maxAge: 24 * 60 * 60 * 1000 // 24 hours
    }
  }));
  app.use("/uploads", express.static(uploadsDir));

  // Middleware to check admin session
  const isAdmin = (req: any, res: any, next: any) => {
    if (req.session.isAdmin) {
      next();
    } else {
      res.status(401).json({ error: "Unauthorized" });
    }
  };

  // API Routes
  app.post("/api/admin/login", async (req, res) => {
    const { email, password } = req.body;
    
    try {
      // Local Dev Fallback Restored
      if (!supabaseUrl || !supabaseKey) {
        if (email === "admin@pixies-pantry.com" && password === "admin") {
          req.session.isAdmin = true;
          return res.json({ success: true });
        }
        return res.status(401).json({ error: "Invalid credentials (Local Dev)" });
      }

      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        return res.status(401).json({ error: error.message });
      }

      if (data.user) {
        req.session.isAdmin = true;
        res.json({ success: true });
      } else {
        res.status(401).json({ error: "Invalid credentials" });
      }
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/admin/logout", (req, res) => {
    req.session.destroy((err) => {
      if (err) return res.status(500).json({ error: "Logout failed" });
      res.clearCookie("connect.sid");
      res.json({ success: true });
    });
  });

  app.get("/api/admin/check", (req, res) => {
    res.json({ isAdmin: !!req.session.isAdmin });
  });

  app.get("/api/orders", isAdmin, async (req, res) => {
    const orders = db.prepare("SELECT * FROM orders ORDER BY created_at DESC").all();
    res.json(orders);
  });

  app.post("/api/orders", async (req, res) => {
    const { name, email, phone, address, order_details, total_amount, uninfused, subscribeNewsletter } = req.body;
    try {
      const insert = db.prepare(`
        INSERT INTO orders (customer_name, customer_email, customer_phone, customer_address, order_details, total_amount, uninfused)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `);
      const result = insert.run(name, email, phone, address, order_details, total_amount, uninfused ? 1 : 0);
      const orderId = result.lastInsertRowid;
      
      // Also save as client
      const insertClient = db.prepare(`
        INSERT INTO clients (name, email, phone, address, source, uninfused)
        VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
          name = excluded.name,
          phone = COALESCE(excluded.phone, clients.phone),
          address = COALESCE(excluded.address, clients.address),
          source = excluded.source,
          uninfused = excluded.uninfused
      `);
      insertClient.run(name, email, phone, address, "Order Form", uninfused ? 1 : 0);

      // Add to newsletter if requested
      if (subscribeNewsletter) {
        try {
          db.prepare("INSERT INTO newsletter (email) VALUES (?)").run(email);
        } catch (e) {
          // Ignore
        }
      }

      // Send Email Receipt via Gemini Generation (Simulation)
      try {
        const prompt = `
          Generate a professional and warm order confirmation email for a gourmet muffin shop called "The Whole Baked Machine".
          Customer Name: ${name}
          Order ID: #${orderId.toString().padStart(4, '0')}
          Order Details: ${order_details}
          Total Amount: ${total_amount}
          Infusion Preference: ${uninfused ? 'Uninfused' : 'Infused'}
          Delivery Address: ${address}
          
          The email should have a subject line and a body.
          Format the response as JSON with "subject" and "body" fields.
        `;

        const response = await genAI.models.generateContent({
          model,
          contents: prompt,
          config: { responseMimeType: "application/json" }
        });

        const emailContent = JSON.parse(response.text);
        
        console.log("--- SENDING EMAIL TO CUSTOMER ---");
        console.log(`To: ${email}`);
        console.log(`Subject: ${emailContent.subject}`);
        console.log(`Body: ${emailContent.body}`);
        console.log("---------------------------------");

        // Send backup email to admin
        console.log("--- SENDING BACKUP EMAIL TO ADMIN ---");
        console.log(`To: admin@pixies-pantry.com`);
        console.log(`Subject: NEW ORDER RECEIVED - #${orderId.toString().padStart(4, '0')}`);
        console.log(`Body: A new order has been placed by ${name}.\n\nDetails: ${order_details}\nTotal: ${total_amount}\nAddress: ${address}`);
        console.log("--------------------------------------");

      } catch (emailError) {
        console.error("Failed to generate/send email notifications", emailError);
      }
      
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.delete("/api/orders/:id", isAdmin, (req, res) => {
    const { id } = req.params;
    db.prepare("DELETE FROM orders WHERE id = ?").run(id);
    res.json({ success: true });
  });

  app.patch("/api/orders/:id/status", isAdmin, (req, res) => {
    const { id } = req.params;
    const { status } = req.body;
    db.prepare("UPDATE orders SET status = ? WHERE id = ?").run(status, id);
    res.json({ success: true });
  });

  app.get("/api/clients", isAdmin, async (req, res) => {
    if (!supabaseUrl || !supabaseKey) {
      const clients = db.prepare("SELECT * FROM clients ORDER BY created_at DESC").all();
      return res.json(clients);
    }
    const { data, error } = await supabase.from("clients").select("*").order("created_at", { ascending: false });
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.post("/api/clients", async (req, res) => {
    const { name, email, phone, address, payment_method, source, uninfused } = req.body;
    if (!supabaseUrl || !supabaseKey) {
      try {
        const insert = db.prepare(`
          INSERT INTO clients (name, email, phone, address, payment_method, source, uninfused)
          VALUES (?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(email) DO UPDATE SET
            name = excluded.name,
            phone = COALESCE(excluded.phone, clients.phone),
            address = COALESCE(excluded.address, clients.address),
            payment_method = COALESCE(excluded.payment_method, clients.payment_method),
            source = excluded.source,
            uninfused = excluded.uninfused
        `);
        insert.run(name, email, phone, address, payment_method, source, uninfused ? 1 : 0);
        
        // If source is newsletter, also add to newsletter table
        if (source === "Newsletter Popup") {
          try {
            db.prepare("INSERT INTO newsletter (email) VALUES (?)").run(email);
          } catch (e) {
            // Ignore
          }
        }

        return res.json({ success: true });
      } catch (error: any) {
        return res.status(500).json({ error: error.message });
      }
    }

    const { error } = await supabase.from("clients").upsert({ 
      name, email, phone, address, payment_method, source, uninfused 
    }, { onConflict: 'email' });
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.get("/api/newsletter", isAdmin, (req, res) => {
    const subscribers = db.prepare("SELECT * FROM newsletter ORDER BY created_at DESC").all();
    res.json(subscribers);
  });

  app.delete("/api/clients/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    if (!supabaseUrl || !supabaseKey) {
      db.prepare("DELETE FROM clients WHERE id = ?").run(id);
      return res.json({ success: true });
    }
    const { error } = await supabase.from("clients").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.get("/api/settings", isAdmin, (req, res) => {
    const settings = db.prepare("SELECT * FROM settings").all();
    const settingsObj = settings.reduce((acc: any, s: any) => {
      acc[s.key] = s.value;
      return acc;
    }, {});
    res.json(settingsObj);
  });

  app.post("/api/settings", isAdmin, (req, res) => {
    const updates = req.body;
    const update = db.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)");
    for (const [key, value] of Object.entries(updates)) {
      update.run(key, value);
    }
    res.json({ success: true });
  });

  app.post("/api/upload", upload.single("image"), (req, res) => {
    if (!req.file) {
      return res.status(400).json({ error: "No file uploaded" });
    }
    const baseUrl = process.env.APP_URL || `http://${req.headers.host}`;
    const imageUrl = `${baseUrl}/uploads/${req.file.filename}`;
    res.json({ imageUrl });
  });
  app.get("/api/products", async (req, res) => {
    if (!supabaseUrl || !supabaseKey) {
      const products = db.prepare("SELECT * FROM products").all();
      const parsedProducts = products.map((p: any) => ({
        ...p,
        variants: p.variants ? JSON.parse(p.variants) : []
      }));
      return res.json(parsedProducts);
    }
    const { data, error } = await supabase.from("products").select("*");
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.get("/api/products/:id", async (req, res) => {
    const { id } = req.params;
    if (!supabaseUrl || !supabaseKey) {
      const product = db.prepare("SELECT * FROM products WHERE id = ?").get(id) as any;
      if (product) {
        product.variants = product.variants ? JSON.parse(product.variants) : [];
      }
      return res.json(product);
    }
    const { data, error } = await supabase.from("products").select("*").eq("id", id).single();
    if (error) return res.status(500).json({ error: error.message });
    res.json(data);
  });

  app.get("/sitemap.xml", async (req, res) => {
    const baseUrl = process.env.APP_URL || `http://${req.headers.host}`;
    let products: any[] = [];
    
    if (!supabaseUrl || !supabaseKey) {
      products = db.prepare("SELECT id FROM products").all();
    } else {
      const { data } = await supabase.from("products").select("id");
      products = data || [];
    }

    const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>${baseUrl}/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  ${products.map(p => `
  <url>
    <loc>${baseUrl}/product/${p.id}</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`).join('')}
</urlset>`;

    res.header('Content-Type', 'application/xml');
    res.send(sitemap);
  });

  app.get("/robots.txt", (req, res) => {
    const baseUrl = process.env.APP_URL || `http://${req.headers.host}`;
    res.type("text/plain");
    res.send(`User-agent: *
Allow: /
Sitemap: ${baseUrl}/sitemap.xml`);
  });

  app.put("/api/products/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    const { price, image, name, description, long_description, ingredients, benefits, link, category, variants } = req.body;
    
    if (!supabaseUrl || !supabaseKey) {
      const update = db.prepare(`
        UPDATE products 
        SET price = ?, image = ?, name = ?, description = ?, long_description = ?, ingredients = ?, benefits = ?, link = ?, category = ?, variants = ? 
        WHERE id = ?
      `);
      update.run(price, image, name, description, long_description, ingredients, benefits, link, category, variants ? JSON.stringify(variants) : null, id);
      return res.json({ success: true });
    }

    const { error } = await supabase
      .from("products")
      .update({ price, image, name, description, long_description, ingredients, benefits, link, category, variants })
      .eq("id", id);
    
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.post("/api/products", isAdmin, async (req, res) => {
    const product = req.body;
    if (!supabaseUrl || !supabaseKey) {
      const insert = db.prepare(`
        INSERT INTO products (id, name, description, long_description, ingredients, benefits, price, image, link, category, variants) 
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insert.run(product.id, product.name, product.description, product.long_description, product.ingredients, product.benefits, product.price, product.image, product.link, product.category, product.variants ? JSON.stringify(product.variants) : null);
      return res.json({ success: true });
    }
    const { error } = await supabase.from("products").insert([product]);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  app.delete("/api/products/:id", isAdmin, async (req, res) => {
    const { id } = req.params;
    if (!supabaseUrl || !supabaseKey) {
      db.prepare("DELETE FROM products WHERE id = ?").run(id);
      return res.json({ success: true });
    }
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) return res.status(500).json({ error: error.message });
    res.json({ success: true });
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  const PORT = 3000;
  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();