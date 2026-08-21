import { createApp } from 'vue'
import './style.css'
import App from './App.vue'
import router from './router'

const app = createApp(App).use(router);
// The router's first navigation resolves asynchronously even with no
// guards, since its guard pipeline always runs through a Promise chain.
// Mounting before it resolves lets RouterView render empty, then patch in
// the matched component a tick later - Vue's dev build (stricter than
// prod) trips over that patch with a "Cannot set properties of null
// (setting '__vnode')" crash, breaking reactivity for the rest of mount.
router.isReady().then(() => {
    app.mount('#app');
});
