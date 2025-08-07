require('dotenv').config({ path: '/Users/samuellucas/Documents/Gemini/cover-letter-generator-api/.env' });
const express = require('express');
const multer = require('multer');
const pdf = require('pdf-parse');
const mammoth = require('mammoth');
const fs = require('fs');

const upload = multer({ dest: 'uploads/' });
const cors = require('cors');
const OpenAI = require('openai');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { knex, initializeDatabase, ensureDefaultUser } = require('./db');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret_key'; // Use a strong secret in production

const app = express();
const port = 5001;

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

app.use(cors()); // Temporarily allow all origins for debugging
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Middleware to protect routes
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (token == null) return res.sendStatus(401); // No token

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403); // Invalid token
    req.user = user;
    next();
  });
};

// Register route
app.post('/register', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const hashedPassword = await bcrypt.hash(password, 10);
    await knex('users').insert({ username, password: hashedPassword });
    res.status(201).json({ message: 'User registered successfully.' });
  } catch (error) {
    console.error('Error registering user:', error);
    res.status(500).json({ error: 'Error registering user.' });
  }
});

// Login route
app.post('/login', async (req, res) => {
  const { username, password } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required.' });
  }

  try {
    const user = await knex('users').where({ username }).first();
    if (!user) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ error: 'Invalid credentials.' });
    }

    const token = jwt.sign({ id: user.id, username: user.username }, JWT_SECRET, { expiresIn: '1h' });
    res.json({ token });
  } catch (error) {
    console.error('Error logging in:', error);
    res.status(500).json({ error: 'Error logging in.' });
  }
});

const getTemperatureForCreativity = (creativity) => {
    const mapping = {
      'Très faible': 0.2,
      'Faible': 0.5,
      'Neutre': 0.8,
      'Créatif': 1.2,
      'Très créatif': 1.5,
    };
    return mapping[creativity] || 0.7; // Default to neutral if undefined
};

app.post('/generate-cover-letter', authenticateToken, async (req, res) => {

  const { cv, jobOfferSummary, creativity } = req.body;

  console.log('Received request to generate cover letter:');
  console.log('CV length:', cv ? cv.length : 'undefined');
  console.log('Job Offer Summary length:', jobOfferSummary ? jobOfferSummary.length : 'undefined');
  console.log('Creativity:', creativity);


  if (!cv || typeof cv !== 'string' || cv.trim() === '') {
    return res.status(400).json({ error: 'Le texte du CV est manquant ou invalide.' });
  }
  if (!jobOfferSummary || typeof jobOfferSummary !== 'string' || jobOfferSummary.trim() === '') {
    return res.status(400).json({ error: 'Le résumé de l\'offre d\'emploi est manquant ou invalide.' });
  }

  try {
    const prompt = `En te basant sur le CV suivant et le résumé de l\'offre d\'emploi, rédige une lettre de motivation professionnelle et personnalisée. Mets en évidence les compétences et expériences du CV qui correspondent aux exigences de l\'offre. La lettre doit être concise et percutante.

CV:
"""
${cv}
"""

Résumé de l\'offre d\'emploi:
"""
${jobOfferSummary}
"""

Lettre de motivation:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // You can choose other models like "gpt-4" if you have access
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500, // Adjust as needed for letter length
      temperature: getTemperatureForCreativity(creativity),
    });

    const generatedCoverLetter = completion.choices[0].message.content.trim();
    res.json({ coverLetter: generatedCoverLetter });

  } catch (error) {
    console.error('Error generating cover letter with OpenAI:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de la lettre de motivation. Veuillez réessayer.' });
  }
});

app.post('/generate-spontaneous-cover-letter', authenticateToken, async (req, res) => {
  const { cv, companySummary, creativity } = req.body;

  console.log('Received request to generate spontaneous cover letter:');
  console.log('CV length:', cv ? cv.length : 'undefined');
  console.log('Company Summary length:', companySummary ? companySummary.length : 'undefined');
  console.log('Creativity:', creativity);

  if (!cv || typeof cv !== 'string' || cv.trim() === '') {
    return res.status(400).json({ error: 'Le texte du CV est manquant ou invalide.' });
  }
  if (!companySummary || typeof companySummary !== 'string' || companySummary.trim() === '') {
    return res.status(400).json({ error: 'Le résumé de l\'entreprise est manquant ou invalide.' });
  }

  try {
    const prompt = `En te basant sur le CV suivant et le résumé de l\'entreprise, rédige une lettre de motivation professionnelle et personnalisée pour une candidature spontanée. Mets en évidence les compétences et expériences du CV qui pourraient être pertinentes pour cette entreprise. La lettre doit être concise et percutante.

CV:
"""
${cv}
"""

Résumé de l\'entreprise:
"""
${companySummary}
"""

Lettre de motivation:`;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo", // You can choose other models like "gpt-4" if you have access
      messages: [{ role: "user", content: prompt }],
      max_tokens: 500, // Adjust as needed for letter length
      temperature: getTemperatureForCreativity(creativity),
    });

    const generatedCoverLetter = completion.choices[0].message.content.trim();
    res.json({ coverLetter: generatedCoverLetter });

  } catch (error) {
    console.error('Error generating spontaneous cover letter with OpenAI:', error);
    res.status(500).json({ error: 'Erreur lors de la génération de la lettre de motivation spontanée. Veuillez réessayer.' });
  }
});

app.post('/api/match-cv', authenticateToken, upload.single('cv'), async (req, res) => {
  const { jobDescription } = req.body;
  const cvPath = req.file.path;

  if (!jobDescription) {
    return res.status(400).json({ error: 'Job description is required.' });
  }

  try {
    let cvText = '';
    if (req.file.mimetype === 'application/pdf') {
      const data = await pdf(fs.readFileSync(cvPath));
      cvText = data.text;
    } else if (req.file.mimetype === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document') {
      const { value } = await mammoth.extractRawText({ path: cvPath });
      cvText = value;
    } else {
      cvText = fs.readFileSync(cvPath, 'utf-8');
    }

    fs.unlinkSync(cvPath); // Clean up the uploaded file

    const prompt = `
      En tant que recruteur expert, analyse le CV suivant et la description de poste.
      Ton objectif est de fournir une analyse extrêmement précise de la correspondance entre le CV et l'offre.

      **Instructions pour les "matching_points" :**
      Sois très proactif et intelligent dans l'identification des points de correspondance. Infère les compétences et qualités du candidat même si elles ne sont pas explicitement listées, mais sont clairement démontrées ou suggérées par l'expérience, la formation, les réalisations, les responsabilités ou les outils mentionnés dans le CV. Cela inclut les compétences techniques, les qualités personnelles (leadership, diplomatie, communication, rigueur, autonomie, curiosité, etc.), et toute connaissance pertinente.

      **Instructions pour les "missing_points" :**
      Sois EXTRÊMEMENT STRICT et conservateur. Les "missing_points" doivent UNIQUEMENT lister les compétences ou exigences explicitement mentionnées dans la description de poste et qui sont ABSOLUMENT ET INCONTESTABLEMENT ABSENTES du CV. Si le CV contient la moindre indication, même indirecte ou implicite, d'une compétence requise, ou si cette compétence peut être raisonnablement déduite de l'expérience, de la formation ou des réalisations, ALORS NE LA LISTE PAS dans les "missing_points". Ne liste ici que les lacunes flagrantes et non compensables par d'autres éléments du CV. Sois impitoyable dans la détection des véritables lacunes, mais ne liste rien qui puisse être déduit.

      Fournis une analyse détaillée sous la forme d'un objet JSON. Ne réponds rien d'autre que l'objet JSON.

      L'objet JSON doit avoir la structure suivante :
      {
        "score": <un nombre entier entre 0 et 100 représentant le pourcentage de correspondance>,
        "matching_points": [
          "<point de correspondance 1>",
          "<point de correspondance 2>",
          "..."
        ],
        "missing_points": [
          "<point manquant 1>",
          "<point manquant 2>",
          "..."
        ],
        "summary": "<un court résumé expliquant pourquoi le score a été donné>"
      }

      CV:
      """
      ${cvText}
      """

      Description de poste:
      """
      ${jobDescription}
      """
    `;

    const completion = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    const resultText = completion.choices[0].message.content.trim();
    const resultJson = JSON.parse(resultText);
    
    res.json(resultJson);

  } catch (error) {
    console.error('Error matching CV with OpenAI:', error);
    res.status(500).json({ error: 'Failed to match CV.' });
  }
});

initializeDatabase().then(() => {
  ensureDefaultUser().then(() => {
    app.listen(port, () => {
      console.log(`Backend server listening at http://localhost:${port}`);
    });
  });
});
