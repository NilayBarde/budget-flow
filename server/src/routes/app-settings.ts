import { Router } from 'express';
import { userContext } from '../db/context.js';
import { asyncHandler } from '../utils/asyncHandler.js';

const router = Router();

// Get all settings (returns { key: value } map)
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { db } = userContext(req);
    const { data, error } = await db.from('app_settings').select('key, value');

    if (error) throw error;

    const settings: Record<string, string> = {};
    for (const row of data || []) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  }),
);

// Get single setting
router.get(
  '/:key',
  asyncHandler(async (req, res) => {
    const { db } = userContext(req);
    const { key } = req.params;
    const { data, error } = await db
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json({ key, value: data?.value ?? null });
  }),
);

// Upsert a setting
router.put(
  '/:key',
  asyncHandler(async (req, res) => {
    const { db, userId } = userContext(req);
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined || value === null) {
      return res.status(400).json({ message: 'Value is required' });
    }

    const { data, error } = await db
      .from('app_settings')
      .upsert({ user_id: userId, key, value: String(value), updated_at: new Date().toISOString() }, { onConflict: 'user_id,key' })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }),
);

export default router;
