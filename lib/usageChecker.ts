import { getVisitorId } from './fingerprint';
import { getUsageCount, addUsage } from './hybridStorage';

export async function checkFreeUsage(): Promise<number> {
    const id = await getVisitorId();
    return await getUsageCount(id);
}

export async function addFreeUsage(credits: number) {
    const id = await getVisitorId();
    await addUsage(id, credits);
}
