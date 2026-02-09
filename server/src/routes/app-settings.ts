import { Router } from 'express';
import { supabase } from '../db/supabase.js';

const router = Router();

// Get all settings (returns { key: value } map)
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('app_settings')
      .select('key, value');

    if (error) throw error;

    const settings: Record<string, string> = {};
    for (const row of data || []) {
      settings[row.key] = row.value;
    }
    res.json(settings);
  } catch (error) {
    console.error('Error fetching app settings:', error);
    res.status(500).json({ message: 'Failed to fetch settings' });
  }
});

// Get single setting
router.get('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { data, error } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', key)
      .single();

    if (error && error.code !== 'PGRST116') throw error;
    res.json({ key, value: data?.value ?? null });
  } catch (error) {
    console.error('Error fetching setting:', error);
    res.status(500).json({ message: 'Failed to fetch setting' });
  }
});

// Upsert a setting
router.put('/:key', async (req, res) => {
  try {
    const { key } = req.params;
    const { value } = req.body;

    if (value === undefined || value === null) {
      return res.status(400).json({ message: 'Value is required' });
    }

    const { data, error } = await supabase
      .from('app_settings')
      .upsert(
        { key, value: String(value), updated_at: new Date().toISOString() },
        { onConflict: 'key' },
      )
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  } catch (error) {
    console.error('Error updating setting:', error);
    res.status(500).json({ message: 'Failed to update setting' });
  }
});

export default router;
