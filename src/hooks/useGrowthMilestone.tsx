import { supabase } from '@/lib/supabaseExternal';

/**
 * Check the growth milestone after a new user signs up.
 * If real users >= seed users * 3, triggers auto-purge of seed data.
 */
export async function checkGrowthMilestone(): Promise<{
  success: boolean;
  milestoneReached: boolean;
  message?: string;
}> {
  try {
    const { data, error } = await supabase.functions.invoke('check-growth-milestone', {
      method: 'POST',
    });

    if (error) {
      console.error('Error checking growth milestone:', error);
      return { success: false, milestoneReached: false, message: error.message };
    }

    return {
      success: data?.success ?? false,
      milestoneReached: data?.milestone_reached ?? false,
      message: data?.message,
    };
  } catch (error) {
    console.error('Failed to check growth milestone:', error);
    return { success: false, milestoneReached: false };
  }
}
