import mysql from "mysql2/promise";
import { readFile } from "node:fs/promises";
import { config, pool } from "../server/db.js";
import { hashPassword } from "../server/security.js";
const c = await mysql.createConnection({ ...config, multipleStatements: true });
try {
  await c.query(
    await readFile(new URL("../database/schema.sql", import.meta.url), "utf8"),
  );
  const password = process.env.DEMO_PASSWORD || "CampusDemo!2026";
  for (const [name, email, role] of [
    ["Alex Morgan", "organizer@campus.test", "organizer"],
    ["Sam Taylor", "student@campus.test", "student"],
  ])
    await c.execute(
      "INSERT IGNORE INTO users(name,email,password_hash,role) VALUES(?,?,?,?)",
      [name, email, hashPassword(password), role],
    );
  const [[owner]] = await c.execute("SELECT id FROM users WHERE email=?", [
    "organizer@campus.test",
  ]);
  const [[count]] = await c.query("SELECT COUNT(*) AS n FROM events");
  if (!count.n) {
    const data = [
      [
        "Build something brilliant",
        "Technology",
        "Innovation Lab, Block A",
        80,
        "A hands-on web development workshop. Bring your laptop, meet fellow builders, and turn your next idea into a working prototype. No previous project experience needed.",
      ],
      [
        "Design beyond the ordinary",
        "Creative",
        "Design Studio, Block C",
        40,
        "Explore visual storytelling, layout, and accessible design with the campus creative community. Make a poster and share feedback in a friendly studio session.",
      ],
      [
        "Your next chapter starts here",
        "Career",
        "Seminar Hall, Block B",
        60,
        "Get your CV ready for internships with practical feedback, interview exercises, and advice from recent graduates. Bring a printed CV or a digital copy.",
      ],
      [
        "A little greener, together",
        "Community",
        "Main Campus Garden",
        50,
        "Spend a relaxed morning planting native saplings and meeting students from across campus. Gardening tools and refreshments are provided.",
      ],
      [
        "Ideas into impact",
        "Technology",
        "Innovation Lab, Block A",
        100,
        "Join a collaborative mini hackathon to build practical solutions for everyday campus problems. Form a team on arrival and present a short prototype at the end.",
      ],
      [
        "The weekend sketchbook",
        "Creative",
        "Open Air Courtyard",
        30,
        "Slow down and draw the campus around you. This beginner-friendly sketch walk includes composition exercises and a small outdoor exhibition. Bring a sketchbook.",
      ],
    ];
    for (let i = 0; i < data.length; i++) {
      const [title, category, venue, capacity, description] = data[i];
      const d = new Date();
      d.setUTCDate(d.getUTCDate() + 7 + i * 3);
      d.setUTCHours(9 + (i % 3), 0, 0, 0);
      await c.execute(
        "INSERT INTO events(title,category,venue,capacity,description,starts_at,owner_id) VALUES(?,?,?,?,?,?,?)",
        [
          title,
          category,
          venue,
          capacity,
          description,
          d.toISOString().slice(0, 19).replace("T", " "),
          owner.id,
        ],
      );
    }
  }
  console.log("Schema and demo records ready. Demo password:", password);
} finally {
  await c.end();
  await pool.end();
}
