import { createStore } from 'vuex'

export default createStore({
  state: {
    playerId: null,
    player: null,
    players: [],
    items: [],
    ws: null,
    connected: false,
    retryCount: 0
  },
  mutations: {
    setPlayerId(state, id) {
      state.playerId = id
    },
    setPlayer(state, player) {
      state.player = player
    },
    setPlayers(state, players) {
      state.players = players
    },
    setItems(state, items) {
      state.items = items
    },
    setWs(state, ws) {
      state.ws = ws
    },
    setConnected(state, connected) {
      state.connected = connected
    },
    setRetryCount(state, count) {
      state.retryCount = count
    },
    updatePlayer(state, updatedPlayer) {
      const index = state.players.findIndex(p => p.id === updatedPlayer.id)
      if (index !== -1) {
        state.players[index] = updatedPlayer
      }
      if (state.player && state.player.id === updatedPlayer.id) {
        state.player = updatedPlayer
      }
    },
    addPlayer(state, player) {
      const exists = state.players.find(p => p.id === player.id)
      if (!exists) {
        state.players.push(player)
      }
    },
    removePlayer(state, playerId) {
      state.players = state.players.filter(p => p.id !== playerId)
    },
    updateItem(state, { itemId, collected }) {
      const item = state.items.find(i => i.id === itemId)
      if (item) {
        item.collected = collected
      }
    }
  },
  actions: {
    connect({ commit, state, dispatch }) {
      return new Promise((resolve, reject) => {
        // In development, connect directly to WebSocket server to avoid proxy issues
        const isDevelopment = process.env.NODE_ENV === 'development'
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:'
        const wsUrl = isDevelopment 
          ? 'ws://localhost:3000/ws'
          : `${protocol}//${window.location.host}/ws`
        
        const ws = new WebSocket(wsUrl)
        
        ws.onopen = () => {
          console.log('Connected to server')
          commit('setConnected', true)
          commit('setWs', ws)
          commit('setRetryCount', 0)
          resolve()
        }
      
      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          dispatch('handleMessage', data)
        } catch (error) {
          console.error('Failed to parse WebSocket message:', error)
        }
      }
      
      ws.onclose = () => {
        console.log('Disconnected from server')
        commit('setConnected', false)
        commit('setWs', null)
        
        const MAX_RETRIES = 5
        if (state.retryCount < MAX_RETRIES) {
          commit('setRetryCount', state.retryCount + 1)
          const delay = Math.min(3000 * Math.pow(2, state.retryCount - 1), 30000)
          console.log(`Reconnecting in ${delay}ms (attempt ${state.retryCount}/${MAX_RETRIES})`)
          setTimeout(() => {
            dispatch('connect')
          }, delay)
        } else {
          console.error('Max reconnection attempts reached')
        }
      }
      
      ws.onerror = (error) => {
        console.error('WebSocket error:', error)
        reject(error)
      }
      })
    },
    
    handleMessage({ commit, state }, data) {
      switch (data.type) {
        case 'init':
          commit('setPlayerId', data.playerId)
          commit('setPlayer', data.player)
          commit('setPlayers', data.players)
          commit('setItems', data.items)
          break
          
        case 'playerJoined':
          commit('addPlayer', data.player)
          break
          
        case 'playerLeft':
          commit('removePlayer', data.playerId)
          break
          
        case 'playerMoved':
          const movedPlayer = state.players.find(p => p.id === data.playerId)
          if (movedPlayer) {
            movedPlayer.x = data.x
            movedPlayer.y = data.y
          }
          // Also update current player if it's the same player
          if (state.player && state.player.id === data.playerId) {
            state.player.x = data.x
            state.player.y = data.y
          }
          break
          
        case 'playerAttacked':
          const attackedPlayer = state.players.find(p => p.id === data.targetId)
          if (attackedPlayer) {
            attackedPlayer.health = data.targetHealth
          }
          break
          
        case 'playerDefending':
          const defendingPlayer = state.players.find(p => p.id === data.playerId)
          if (defendingPlayer) {
            defendingPlayer.isDefending = data.isDefending
          }
          break
          
        case 'playerDied':
          const deadPlayer = state.players.find(p => p.id === data.playerId)
          if (deadPlayer) {
            deadPlayer.health = 0
          }
          break
          
        case 'playerRespawned':
          commit('updatePlayer', data.player)
          break
          
        case 'itemCollected':
          commit('updateItem', { itemId: data.itemId, collected: true })
          const collectedPlayer = state.players.find(p => p.id === data.playerId)
          if (collectedPlayer) {
            collectedPlayer.health = data.playerHealth
            collectedPlayer.shield = data.playerShield
          }
          break
          
        case 'itemUsed':
          const usedPlayer = state.players.find(p => p.id === data.playerId)
          if (usedPlayer) {
            usedPlayer.health = data.playerHealth
            usedPlayer.shield = data.playerShield
          }
          break
      }
    },
    
    register({ state }, nickname) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
          type: 'register',
          nickname: nickname
        }))
      }
    },
    
    move({ state }, { x, y }) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
          type: 'move',
          x: x,
          y: y
        }))
      }
    },
    
    attack({ state }) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
          type: 'attack'
        }))
      }
    },
    
    defend({ state }, isDefending) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
          type: 'defend',
          isDefending: isDefending
        }))
      }
    },
    
    collectItem({ state }, itemId) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
          type: 'collectItem',
          itemId: itemId
        }))
      }
    },
    
    useItem({ state }, itemType) {
      if (state.ws && state.ws.readyState === WebSocket.OPEN) {
        state.ws.send(JSON.stringify({
          type: 'useItem',
          itemType: itemType
        }))
      }
    }
  },
  getters: {
    getPlayer: state => state.player,
    getPlayers: state => state.players,
    getItems: state => state.items,
    isConnected: state => state.connected
  }
})