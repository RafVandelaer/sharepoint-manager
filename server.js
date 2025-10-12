const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const authRoutes = require('./routes/auth');
const sharePointRoutes = require('./routes/sharepoint');
const optimizedRoutes = require('./routes/optimizedSharepoint');

const app = express();
const PORT = process.env.PORT || 3000;

// Increase timeout for long-running requests
app.timeout = 10 * 60 * 1000; // 10 minutes

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// Routes
app.use('/api/auth', authRoutes); // Verplaats naar /api/auth zodat frontend werkt
app.use('/auth', authRoutes); // Behoud ook oude pad voor backward compatibility
app.use('/api/sharepoint', sharePointRoutes);
app.use('/api/sharepoint-v2', optimizedRoutes); // Optimized routes with streaming support

// Main route
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
    console.error(err.stack);
    res.status(500).json({ error: 'Something went wrong!' });
});

app.listen(PORT, () => {
    console.log(`SharePoint Manager running on http://localhost:${PORT}`);
    console.log('Make sure to configure your .env file with Azure App Registration details');
    
    // Debug output voor belangrijk configuratie parameters
    console.log('\nServer Configuration:');
    console.log('- PORT:', process.env.PORT);
    console.log('- TENANT_ID:', process.env.TENANT_ID ? 'Is geconfigureerd' : 'Ontbreekt');
    console.log('- CLIENT_ID:', process.env.CLIENT_ID ? 'Is geconfigureerd' : 'Ontbreekt');
    console.log('- CLIENT_SECRET:', process.env.CLIENT_SECRET ? 'Is geconfigureerd (lengte: ' + 
        (process.env.CLIENT_SECRET ? process.env.CLIENT_SECRET.length : 0) + ')' : 'Ontbreekt');
    console.log('- REDIRECT_URI:', process.env.REDIRECT_URI);
    console.log('- GRAPH_API_URL:', process.env.GRAPH_API_URL);
});

module.exports = app;