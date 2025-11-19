import NDK, {
    NDKEvent,
    type NDKFilter,
} from '@nostr-dev-kit/ndk';
import type { DiscoveredFederation } from '../../hooks/Federation.type';
import { previewFedWithInviteCode } from '../fedimint/FederationService';

export const handleDiscoverFederation = async (
    ndk: NDK,
    setState: (feds: DiscoveredFederation[]) => void,
    discoveredFederations: DiscoveredFederation[]
) => {
    console.log('Starting federation discovery...');
    if (!ndk.pool.connectedRelays().length) {
        console.log('No connected relays, waiting for connection...');
    }

    const processingFederationIds = new Set<string>();

    const FedEventFilter: NDKFilter = {
        kinds: [38173],
    } as unknown as NDKFilter;

    const subscription = ndk.subscribe(FedEventFilter, { closeOnEose: false });

    subscription.on('event', async (event: NDKEvent) => {
        console.log('Received event:', event.id, 'kind:', event.kind);
        if (event.kind !== 38173) return;

        try {
            await processFederationEvent(
                event,
                discoveredFederations,
                setState,
                processingFederationIds
            );
        } catch (err) {
            console.error('Error processing federation event:', err);
        }
    });

    setTimeout(() => {
        console.log(`Stopping federation discovery`);
        subscription.stop();
    }, 30000);

    subscription.on('eose', () => {
        console.log('End of stored events');
    });

    subscription.on('close', () => {
        console.log('Subscription closed');
    });

    return subscription;
};

const processFederationEvent = async (
    event: NDKEvent,
    discoveredFederations: DiscoveredFederation[],
    setState: (feds: DiscoveredFederation[]) => void,
    processingFederationIds: Set<string>
): Promise<void> => {
    console.log('Processing federation event:', event.id);

    if (!event.tags || event.tags.length === 0) {
        console.log('Event has no tags, skipping');
        return;
    }

    const inviteTags = event.getMatchingTags('u');
    if (!inviteTags || inviteTags.length === 0) {
        console.log('No invite tags found, skipping event');
        return;
    }

    const inviteCode = inviteTags[0]?.[1];
    if (!inviteCode) {
        console.log('Empty invite code, skipping event');
        return;
    }

    const fedTags = event.getMatchingTags('d');
    if (!fedTags || fedTags.length === 0) {
        console.log('No federation ID tags found, skipping event');
        return;
    }

    const federationId = fedTags[0]?.[1];
    if (!federationId) {
        console.log('Empty federation ID, skipping event');
        return;
    }

    if (discoveredFederations.some((f) => f.federationID === federationId)) {
        console.log('Federation already discovered:', federationId);
        return;
    }

    if (processingFederationIds.has(federationId)) {
        console.log('Federation already being processed:', federationId);
        return;
    }

    processingFederationIds.add(federationId);

    try {
        const previewResult = await previewFedWithInviteCode(inviteCode);
        if (discoveredFederations.some((f) => f.federationID === federationId)) {
            console.log('Federation was discovered while processing:', federationId);
            return;
        }

        const federation: DiscoveredFederation = {
            inviteCode,
            federationID: federationId,
            iconUrl: previewResult.iconUrl,
            fedName: previewResult.fedName,
            welcomeMessage: previewResult.welcomeMessage,
            onChainDeposit: previewResult.onChainDeposit,
            totalGuardians: previewResult.totalGuardians,
            maxBalance: previewResult.maxBalance,
            consensousVersion: previewResult.consensousVersion,
            modules: previewResult.modules,
        };

        discoveredFederations.push(federation);
        setState([...discoveredFederations]);
    } finally {
        processingFederationIds.delete(federationId);
    }
};