import { CallBudgetError, type CallBudget, type Knowledge } from '../../services/knowledge';
import type { LookupResult } from './data';
import { matchEdition, matchForm, type RequestedLookup } from './lookups';

export interface RunDeps {
  knowledge: Knowledge;
  now?: () => Date;
  /** Where a failure is reported (never the question, never what was found). */
  warn?: (message: string) => void;
}

export interface RunOutcome {
  results: LookupResult[];
  /** The ign whose random photo goes with the answer (the member is visible and has photos), or null. */
  photoOf: string | null;
}

/**
 * Runs the checked lookups, in parallel, through `services/knowledge`. Every lookup answers on its own: one that fails
 * (the API is down, the question used its calls) becomes a `failed` result and the rest are still answered. The calls
 * a question may start are counted in `budget`; a random photo reserves its call here, since the command makes it later.
 */
export const runLookups = async (requested: readonly RequestedLookup[], deps: RunDeps, budget: CallBudget): Promise<RunOutcome> => {
  const { knowledge } = deps;
  const now = deps.now ?? (() => new Date());
  const warn = deps.warn ?? ((message: string) => console.warn(message));
  let photoOf: string | null = null;

  const run = async (lookup: RequestedLookup): Promise<LookupResult> => {
    switch (lookup.kind) {
      case 'player':
        return { kind: 'player', ign: lookup.ign, player: await knowledge.player(lookup.ign, budget) };

      case 'player_top_photo':
        return { kind: 'player_top_photo', ign: lookup.ign, photo: await knowledge.topPhoto(lookup.ign, budget) };

      case 'player_random_photo': {
        // The random photo of an author knows nothing about hidden profiles, so the profile is read first
        const player = await knowledge.player(lookup.ign, budget);
        let photo = false;
        if (player?.status === 'visible' && player.photo_counts.images + player.photo_counts.videos > 0) {
          budget.take();
          photoOf = player.ign;
          photo = true;
        }
        return { kind: 'player_random_photo', ign: lookup.ign, player, photo };
      }

      case 'edition': {
        // Only the public editions the API lists can be named; a private one is just "not found", like an unknown one
        const listed = matchEdition(lookup.name, await knowledge.editions(budget));
        return { kind: 'edition', name: lookup.name, edition: listed ? await knowledge.edition(listed.id, budget) : null };
      }

      case 'editions_list':
        return { kind: 'editions_list', editions: await knowledge.editions(budget) };

      case 'form':
        return { kind: 'form', name: lookup.name, form: matchForm(lookup.name, await knowledge.forms(budget)) };

      case 'forms_list':
        return { kind: 'forms_list', forms: await knowledge.forms(budget) };

      case 'panita_picks': {
        const year = lookup.year ?? now().getUTCFullYear();
        return { kind: 'panita_picks', year, picks: await knowledge.panitaPicks(year, budget) };
      }

      case 'donors':
        return { kind: 'donors', donors: await knowledge.donors(budget) };

      case 'instances':
        return { kind: 'instances', instances: await knowledge.instances(budget) };
    }
  };

  const results = await Promise.all(requested.map(async (lookup): Promise<LookupResult> => {
    try {
      return await run(lookup);
    } catch (error) {
      if (error instanceof CallBudgetError) return { kind: 'failed', reason: 'busy' };
      warn(`[Ask] The lookup ${lookup.kind} failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return { kind: 'failed', reason: 'unavailable' };
    }
  }));

  // A photo is only sent when its lookup did not end up failing
  const photoKept = results.some(result => result.kind === 'player_random_photo' && result.photo);
  return { results, photoOf: photoKept ? photoOf : null };
};
