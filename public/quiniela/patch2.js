const fs = require('fs');
let content = fs.readFileSync('app.js', 'utf8');
content = content.replace("getUserTickets\n} from './app_db.js';", "getUserTickets,\n  syncWithApiFootball\n} from './app_db.js';");
fs.writeFileSync('app.js', content);
