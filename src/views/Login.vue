<template>
  <div class="login-container">
    <div class="login-box">
      <h1 class="title">⚔️ PvP Battle Arena</h1>
      <p class="subtitle">Введите ваш никнейм для входа в игру</p>
      
      <form @submit.prevent="handleLogin" class="login-form">
        <div class="input-group">
          <input
            type="text"
            v-model="nickname"
            placeholder="Ваш никнейм"
            maxlength="20"
            required
            class="nickname-input"
          />
        </div>
        
        <button type="submit" class="login-button" :disabled="!nickname.trim()">
          Войти в игру
        </button>
      </form>
      
      <div class="info">
        <p>🎮 Управление:</p>
        <ul>
          <li>WASD / Стрелки - движение</li>
          <li>Пробел - атака</li>
          <li>Shift - защита</li>
          <li>E - собрать предмет</li>
          <li>1-4 - использовать предмет</li>
        </ul>
      </div>
    </div>
  </div>
</template>

<script>
import { mapActions } from 'vuex'

export default {
  name: 'LoginView',
  data() {
    return {
      nickname: ''
    }
  },
  methods: {
    ...mapActions(['connect', 'register']),
    
    async handleLogin() {
      if (this.nickname.trim()) {
        try {
          await this.connect()
          this.register(this.nickname.trim())
          this.$router.push('/game')
        } catch (error) {
          console.error('Connection failed:', error)
        }
      }
    }
  }
}
</script>

<style scoped>
.login-container {
  display: flex;
  justify-content: center;
  align-items: center;
  min-height: 100vh;
  padding: 20px;
}

.login-box {
  background: rgba(255, 255, 255, 0.1);
  backdrop-filter: blur(10px);
  border-radius: 20px;
  padding: 40px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  max-width: 400px;
  width: 100%;
  text-align: center;
}

.title {
  color: #fff;
  font-size: 2.5rem;
  margin-bottom: 10px;
  text-shadow: 0 0 20px rgba(255, 255, 255, 0.5);
}

.subtitle {
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 30px;
  font-size: 1rem;
}

.login-form {
  margin-bottom: 30px;
}

.input-group {
  margin-bottom: 20px;
}

.nickname-input {
  width: 100%;
  padding: 15px 20px;
  border: none;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
  font-size: 1rem;
  outline: none;
  transition: all 0.3s ease;
}

.nickname-input::placeholder {
  color: rgba(255, 255, 255, 0.5);
}

.nickname-input:focus {
  background: rgba(255, 255, 255, 0.2);
  box-shadow: 0 0 20px rgba(255, 255, 255, 0.2);
}

.login-button {
  width: 100%;
  padding: 15px;
  border: none;
  border-radius: 10px;
  background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
  color: #fff;
  font-size: 1.1rem;
  font-weight: bold;
  cursor: pointer;
  transition: all 0.3s ease;
  text-transform: uppercase;
  letter-spacing: 1px;
}

.login-button:hover:not(:disabled) {
  transform: translateY(-2px);
  box-shadow: 0 10px 30px rgba(102, 126, 234, 0.4);
}

.login-button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.info {
  text-align: left;
  background: rgba(0, 0, 0, 0.2);
  padding: 20px;
  border-radius: 10px;
}

.info p {
  color: #fff;
  font-weight: bold;
  margin-bottom: 10px;
}

.info ul {
  list-style: none;
  padding: 0;
}

.info li {
  color: rgba(255, 255, 255, 0.7);
  padding: 5px 0;
  font-size: 0.9rem;
}

.info li::before {
  content: "• ";
  color: #667eea;
}
</style>