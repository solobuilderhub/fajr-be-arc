/**
 * Organization Profile Repository
 *
 * Uses getOrCreate for singleton-per-org behavior.
 */

import { Repository, timestampPlugin } from '@classytic/mongokit';
import OrgProfile from './org-profile.model.js';

const orgProfileRepository = new Repository(OrgProfile, [timestampPlugin()]);

export default orgProfileRepository;
