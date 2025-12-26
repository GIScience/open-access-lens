import { createRouter, createWebHashHistory } from 'vue-router';
import DashboardView from './views/DashboardView.vue';

const routes = [
    { path: '/', component: DashboardView },
    { path: '/isochrones', component: DashboardView },
    { path: '/:country', component: DashboardView },
];

const router = createRouter({
    history: createWebHashHistory(),
    routes,
});

export default router;
