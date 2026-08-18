import axios from 'axios';

const api = axios.create({
    baseURL: '/api',
    withCredentials: true, // This is important for Laravel Sanctum to work properly
    headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
    }
});

export default api;