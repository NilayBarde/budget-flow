import { supabaseAdmin } from '../db/supabase.js';
import { adminContext, type DbContext } from '../db/context.js';

const PER_PAGE = 1000;

/** The lowercased value of --user-email <email> (or --user-email=<email>), or null. */
export const userEmailArg = (argv: string[]): string | null => {
  const inline = argv.find(arg => arg.startsWith('--user-email='));
  const value = inline ? inline.slice('--user-email='.length) : argv[argv.indexOf('--user-email') + 1];
  if (!inline && !argv.includes('--user-email')) return null;
  return value && !value.startsWith('--') ? value.toLowerCase() : null;
};

/**
 * Scripts run as the service role, so they must say whose data they work on: --user-email picks
 * the user, and every service they call stays inside that user's data. Fails before touching any
 * data when the flag is missing or names nobody.
 */
export const scriptContext = async (argv: string[] = process.argv): Promise<DbContext> => {
  const email = userEmailArg(argv);
  if (!email) throw new Error('Pass --user-email <email> to say whose data this script works on');

  for (let page = 1; ; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: PER_PAGE });
    if (error) throw error;
    const user = data.users.find(u => u.email?.toLowerCase() === email);
    if (user) return adminContext(user.id);
    if (data.users.length < PER_PAGE) break;
  }
  throw new Error(`No Supabase Auth user has the email ${email}`);
};
