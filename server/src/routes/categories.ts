import { Router } from 'express';
import { userContext } from '../db/context.js';
import { randomUUID } from 'node:crypto';
import { asyncHandler } from '../utils/asyncHandler.js';
import { pickFields } from '../utils/pickFields.js';

const router = Router();

// Get all categories
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const { db } = userContext(req);
    const { data, error } = await db.from('categories').select('*').order('name');

    if (error) throw error;
    res.json(data);
  }),
);

// Create category
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { db } = userContext(req);
    const { name, icon, color } = req.body;

    const { data, error } = await db
      .from('categories')
      .insert({
        id: randomUUID(),
        name,
        icon,
        color,
        is_default: false,
      })
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }),
);

// Update category
router.patch(
  '/:id',
  asyncHandler(async (req, res) => {
    const { db } = userContext(req);
    const { id } = req.params;
    // Not is_default: that would let a default category be deleted
    const updates = pickFields(req.body, ['name', 'icon', 'color']);
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ message: 'No valid fields to update' });
    }

    const { data, error } = await db
      .from('categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;
    res.json(data);
  }),
);

// Delete category
router.delete(
  '/:id',
  asyncHandler(async (req, res) => {
    const { db } = userContext(req);
    const { id } = req.params;

    // Check if it's a default category
    const { data: category } = await db
      .from('categories')
      .select('is_default')
      .eq('id', id)
      .single();

    if (category?.is_default) {
      return res.status(400).json({ message: 'Cannot delete default category' });
    }

    const { error } = await db.from('categories').delete().eq('id', id);

    if (error) throw error;
    res.status(204).send();
  }),
);

export default router;
