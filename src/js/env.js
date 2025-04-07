console.log('VITE_CLIENT_ID:', import.meta.env.VITE_CLIENT_ID);
console.log('VITE_CLIENT_SECRET:', import.meta.env.VITE_CLIENT_SECRET);
const ENV = {
    CLIENT_ID: import.meta.env.VITE_CLIENT_ID,
    CLIENT_SECRET: import.meta.env.VITE_CLIENT_SECRET
};
export default ENV;