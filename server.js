const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const cors = require('cors');
const helmet = require('helmet');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Handle WebSocket server errors
wss.on('error', (error) => {
  console.error('WebSocket server error:', error);
});

// Middleware
app.use(cors());
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"]
    }
  },
  crossOriginEmbedderPolicy: false
}));
app.use(express.json());
app.use(express.static(path.join(__dirname, 'dist')));

// Game state
const players = new Map();
const playerTimers = new Map(); // Track timers for each player to prevent memory leaks
const playerMessageCounts = new Map(); // Track message counts for rate limiting
const RATE_LIMIT_WINDOW = 1000; // 1 second
const RATE_LIMIT_MAX_MESSAGES = 30; // Max messages per window (increased for smooth movement)
const gameState = {
  width: 2000,
  height: 2000,
  players: new Map(),
  items: []
};

// Generate random items on the map
function generateItems() {
  const itemTypes = ['health_potion', 'shield', 'speed_boost', 'damage_boost'];
  for (let i = 0; i < 20; i++) {
    gameState.items.push({
      id: `item_${i}`,
      type: itemTypes[Math.floor(Math.random() * itemTypes.length)],
      x: Math.random() * gameState.width,
      y: Math.random() * gameState.height,
      collected: false
    });
  }
}

generateItems();

// Periodically clean up collected items and regenerate them
setInterval(() => {
  gameState.items = gameState.items.filter(i => !i.collected);
  while (gameState.items.length < 20) {
    const itemTypes = ['health_potion', 'shield', 'speed_boost', 'damage_boost'];
    gameState.items.push({
      id: `item_${Date.now()}_${Math.random()}`,
      type: itemTypes[Math.floor(Math.random() * itemTypes.length)],
      x: Math.random() * gameState.width,
      y: Math.random() * gameState.height,
      collected: false
    });
  }
}, 30000);

// Helper function to safely send WebSocket messages
function safeSend(ws, message) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify(message));
    } catch (error) {
      console.error('Error sending WebSocket message:', error);
    }
  }
}

// WebSocket connection handling
wss.on('connection', (ws) => {
  console.log('New player connected');
  
  let playerId = null;
  
  ws.on('message', (message) => {
    // Rate limiting check
    const now = Date.now();
    if (!playerMessageCounts.has(ws)) {
      playerMessageCounts.set(ws, { count: 1, windowStart: now });
    } else {
      const msgData = playerMessageCounts.get(ws);
      if (now - msgData.windowStart > RATE_LIMIT_WINDOW) {
        // New window
        msgData.count = 1;
        msgData.windowStart = now;
      } else {
        msgData.count++;
        if (msgData.count > RATE_LIMIT_MAX_MESSAGES) {
          safeSend(ws, { type: 'error', message: 'Rate limit exceeded. Please slow down.' });
          return;
        }
      }
    }
    
    try {
      const data = JSON.parse(message);
      
      // Validate message format
      if (!data.type || typeof data.type !== 'string') {
        safeSend(ws, { type: 'error', message: 'Invalid message format' });
        return;
      }
      
      switch (data.type) {
        case 'register':
          const nickname = data.nickname?.trim();
          if (!nickname || nickname.length < 2 || nickname.length > 20 || !/^[a-zA-Z0-9_]+$/.test(nickname)) {
            safeSend(ws, { type: 'error', message: 'Invalid nickname. Must be 2-20 alphanumeric characters.' });
            return;
          }
          // Generate unique player ID using timestamp + random to prevent collisions
          playerId = `${nickname}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          while (gameState.players.has(playerId)) {
            playerId = `${nickname}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
          }
          const player = {
            id: playerId,
            nickname: data.nickname,
            x: Math.random() * gameState.width,
            y: Math.random() * gameState.height,
            health: 100,
            maxHealth: 100,
            shield: 0,
            speed: 5,
            damage: 10,
            isDefending: false,
            inventory: [],
            score: 0,
            color: `hsl(${Math.random() * 360}, 70%, 50%)`
          };
          
          gameState.players.set(playerId, player);
          players.set(ws, playerId);
          
          // Send initial game state to new player
          safeSend(ws, {
            type: 'init',
            playerId: playerId,
            player: player,
            players: Array.from(gameState.players.values()),
            items: gameState.items
          });
          
          // Notify all players about new player
          broadcast({
            type: 'playerJoined',
            player: player
          }, ws);
          
          console.log(`Player ${playerId} registered`);
          break;
          
        case 'move':
          if (playerId && gameState.players.has(playerId)) {
            const player = gameState.players.get(playerId);
            player.x = Math.max(0, Math.min(gameState.width, data.x));
            player.y = Math.max(0, Math.min(gameState.height, data.y));
            
            broadcast({
              type: 'playerMoved',
              playerId: playerId,
              x: player.x,
              y: player.y
            });
          }
          break;
          
        case 'attack':
          if (playerId && gameState.players.has(playerId)) {
            const attacker = gameState.players.get(playerId);
            
            gameState.players.forEach((target, targetId) => {
              if (targetId !== playerId) {
                const distance = Math.sqrt(
                  Math.pow(attacker.x - target.x, 2) + 
                  Math.pow(attacker.y - target.y, 2)
                );
                
                if (distance < 100) { // Attack range
                  let damage = attacker.damage;
                  if (target.isDefending) {
                    damage = Math.floor(damage * 0.3);
                  }
                  if (target.shield > 0) {
                    const shieldAbsorb = Math.min(target.shield, damage);
                    target.shield -= shieldAbsorb;
                    damage -= shieldAbsorb;
                  }
                  
                  target.health = Math.max(0, target.health - damage);
                  
                  broadcast({
                    type: 'playerAttacked',
                    attackerId: playerId,
                    targetId: targetId,
                    damage: damage,
                    targetHealth: target.health
                  });
                  
                  if (target.health <= 0) {
                    attacker.score += 100;
                    broadcast({
                      type: 'playerDied',
                      playerId: targetId,
                      killerId: playerId
                    });
                    
                    // Respawn player - store targetId in closure to avoid race condition
                    const targetPlayerId = targetId;
                    const respawnTimer = setTimeout(() => {
                      const currentPlayer = gameState.players.get(targetPlayerId);
                      if (currentPlayer) {
                        currentPlayer.health = currentPlayer.maxHealth;
                        currentPlayer.x = Math.random() * gameState.width;
                        currentPlayer.y = Math.random() * gameState.height;
                        broadcast({
                          type: 'playerRespawned',
                          player: currentPlayer
                        });
                      }
                      // Clean up timer reference
                      const timers = playerTimers.get(targetPlayerId);
                      if (timers) {
                        timers.delete('respawn');
                      }
                    }, 3000);
                    
                    // Store timer reference for cleanup
                    if (!playerTimers.has(targetPlayerId)) {
                      playerTimers.set(targetPlayerId, new Map());
                    }
                    playerTimers.get(targetPlayerId).set('respawn', respawnTimer);
                  }
                }
              }
            });
          }
          break;
          
        case 'defend':
          if (playerId && gameState.players.has(playerId)) {
            const player = gameState.players.get(playerId);
            player.isDefending = data.isDefending;
            
            broadcast({
              type: 'playerDefending',
              playerId: playerId,
              isDefending: player.isDefending
            });
          }
          break;
          
        case 'collectItem':
          if (playerId && gameState.players.has(playerId)) {
            const player = gameState.players.get(playerId);
            const item = gameState.items.find(i => i.id === data.itemId && !i.collected);
            
            if (item) {
              const distance = Math.sqrt(
                Math.pow(player.x - item.x, 2) + 
                Math.pow(player.y - item.y, 2)
              );
              
              if (distance < 50) {
                item.collected = true;
                player.inventory.push(item.type);
                
                // Apply item effect
                switch (item.type) {
                  case 'health_potion':
                    player.health = Math.min(player.maxHealth, player.health + 30);
                    break;
                  case 'shield':
                    player.shield = Math.min(50, player.shield + 25);
                    break;
                  case 'speed_boost':
                    player.speed = Math.min(10, player.speed + 2);
                    const speedTimer = setTimeout(() => {
                      const currentPlayer = gameState.players.get(playerId);
                      if (currentPlayer) currentPlayer.speed = 5;
                      // Clean up timer reference
                      const timers = playerTimers.get(playerId);
                      if (timers) timers.delete('speed_boost');
                    }, 10000);
                    // Store timer reference for cleanup
                    if (!playerTimers.has(playerId)) {
                      playerTimers.set(playerId, new Map());
                    }
                    playerTimers.get(playerId).set('speed_boost', speedTimer);
                    break;
                  case 'damage_boost':
                    player.damage = Math.min(25, player.damage + 5);
                    const damageTimer = setTimeout(() => {
                      const currentPlayer = gameState.players.get(playerId);
                      if (currentPlayer) currentPlayer.damage = 10;
                      // Clean up timer reference
                      const timers = playerTimers.get(playerId);
                      if (timers) timers.delete('damage_boost');
                    }, 10000);
                    // Store timer reference for cleanup
                    if (!playerTimers.has(playerId)) {
                      playerTimers.set(playerId, new Map());
                    }
                    playerTimers.get(playerId).set('damage_boost', damageTimer);
                    break;
                }
                
                broadcast({
                  type: 'itemCollected',
                  itemId: item.id,
                  playerId: playerId,
                  itemType: item.type,
                  playerHealth: player.health,
                  playerShield: player.shield
                });
              }
            }
          }
          break;
          
        case 'useItem':
          if (playerId && gameState.players.has(playerId)) {
            const player = gameState.players.get(playerId);
            const itemIndex = player.inventory.indexOf(data.itemType);
            
            if (itemIndex !== -1) {
              player.inventory.splice(itemIndex, 1);
              
              switch (data.itemType) {
                case 'health_potion':
                  player.health = Math.min(player.maxHealth, player.health + 30);
                  break;
                case 'shield':
                  player.shield = Math.min(50, player.shield + 25);
                  break;
              }
              
              broadcast({
                type: 'itemUsed',
                playerId: playerId,
                itemType: data.itemType,
                playerHealth: player.health,
                playerShield: player.shield
              });
            }
          }
          break;
      }
    } catch (error) {
      console.error('Error processing message:', error);
      safeSend(ws, { type: 'error', message: 'Invalid JSON' });
    }
  });
  
  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    // Clean up player if exists
    if (playerId) {
      // Clear all timers for this player
      const timers = playerTimers.get(playerId);
      if (timers) {
        timers.forEach((timer) => clearTimeout(timer));
        playerTimers.delete(playerId);
      }
      // Clear rate limiting data
      playerMessageCounts.delete(ws);
      gameState.players.delete(playerId);
      players.delete(ws);
      broadcast({
        type: 'playerLeft',
        playerId: playerId
      });
    }
  });
  
  ws.on('close', () => {
    if (playerId) {
      // Clear all timers for this player
      const timers = playerTimers.get(playerId);
      if (timers) {
        timers.forEach((timer) => clearTimeout(timer));
        playerTimers.delete(playerId);
      }
      // Clear rate limiting data
      playerMessageCounts.delete(ws);
      gameState.players.delete(playerId);
      players.delete(ws);
      
      broadcast({
        type: 'playerLeft',
        playerId: playerId
      });
      
      console.log(`Player ${playerId} disconnected`);
    }
  });
});

// Broadcast to all connected clients
function broadcast(message, excludeWs = null) {
  wss.clients.forEach((client) => {
    if (client !== excludeWs) {
      safeSend(client, message);
    }
  });
}

// Serve Vue app
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'dist', 'index.html'));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});