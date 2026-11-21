import { PrismaService } from '../prisma/prisma.service';

/**
 * Default category names seeded for every existing user.
 * Seeds intentionally set no color; users can assign their own palette later.
 */
export const DEFAULT_CATEGORIES = [
  'Personal',
  'Work',
  'Study',
  'Health',
  'Shopping',
  'Finance',
  'Family',
  'Travel',
  'Meetings',
  'Projects',
  'Fitness',
  'Other',
];

/**
 * Idempotently seeds the default categories for every existing user.
 *
 * - Creates one category per user per default name (respecting the
 *   `@@unique([name, userId])` rule from the Prisma schema).
 * - Does not delete or overwrite any existing category, including
 *   user-created ones.
 * - Creates nothing when there are no users, so the mechanism never
 *   invents accounts or categories for users that do not exist.
 *
 * Returns the number of categories actually inserted.
 */
export async function seedDefaultCategories(
  prisma: PrismaService,
): Promise<number> {
  const users = await prisma.user.findMany({ select: { id: true } });
  if (users.length === 0) {
    return 0;
  }

  const data = users.flatMap((user) =>
    DEFAULT_CATEGORIES.map((name) => ({ name, userId: user.id })),
  );

  const result = await prisma.category.createMany({
    data,
    // Conflicts are skipped rather than failing, so re-running the seed is
    // safe: duplicate names and categories already created by users are
    // left untouched.
    skipDuplicates: true,
  });

  return result.count;
}
