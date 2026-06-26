import { json } from '../_lib/respond.js';

export const onRequestGet = async ({ data }) => json({ user: data.user || null });
