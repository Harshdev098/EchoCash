// Updated src/services/TransferFund.ts
import type { Wallet } from "@fedimint/core-web"
import type { Manager } from "coco-cashu-core"

export const TransferFunds = async (
    activeTab: boolean,
    Fedimintwallet: Wallet | null,
    CocoManager: Manager | null,
    sendMessage: (toPeerId: string, content: string) => Promise<boolean>, // P2P send function
    persistentUserId: string,
    transferAmount: number,
    selectedPeerId: string
) => {
    try {
        let ecashData: any

        if (!activeTab) {
            // Fedimint transaction
            if (!Fedimintwallet) {
                throw new Error("Fedimint wallet not initialized")
            }

            console.log("Sending Fedimint ecash...")
            const result = await Fedimintwallet.mint.spendNotes(transferAmount * 1000)
            console.log("Fedimint spend result:", result)

            ecashData = {
                type: "fedimint",
                notes: result?.notes,
                amount: transferAmount * 1000,
                from: persistentUserId,
                timestamp: Date.now()
            }
        } else {
            // Cashu transaction
            if (!CocoManager) {
                throw new Error("Cashu wallet not initialized")
            }

            const mintURL = localStorage.getItem("trustedMint")
            if (!mintURL) {
                throw new Error("No mint selected")
            }

            console.log("Sending Cashu ecash...")
            const result = await CocoManager.wallet.send(mintURL, transferAmount)
            console.log("Cashu send result:", result)

            ecashData = {
                type: "cashu",
                proofs: result?.proofs,
                mint: mintURL,
                amount: transferAmount,
                from: persistentUserId,
                timestamp: Date.now()
            }
        }

        // Create ecash message
        const ecashMessage = JSON.stringify(ecashData)

        // Send via P2P
        const isP2P = await sendMessage(selectedPeerId, ecashMessage)

        if (isP2P) {
            console.log("✅ Ecash sent via P2P connection")
        } else {
            console.log("⚠️ Ecash sent via server relay (P2P not available)")
        }

        return { success: true, isP2P }

    } catch (error) {
        console.error("Error in TransferFunds:", error)
        throw error
    }
}

// Function to handle receiving ecash
export const ReceiveEcash = async (
    ecashData: any,
    Fedimintwallet: Wallet | null,
    CocoManager: Manager | null
) => {
    try {
        console.log("Receiving ecash:", ecashData)

        const data = typeof ecashData === 'string' ? JSON.parse(ecashData) : ecashData

        if (data.type === "fedimint") {
            if (!Fedimintwallet) {
                throw new Error("Fedimint wallet not initialized")
            }

            console.log("Receiving Fedimint notes...")
            await Fedimintwallet.mint.reissueExternalNotes(data.notes)
            console.log("✅ Fedimint notes received successfully")
            
            return {
                success: true,
                type: "fedimint",
                amount: data.amount / 1000
            }

        } else if (data.type === "cashu") {
            if (!CocoManager) {
                throw new Error("Cashu wallet not initialized")
            }

            console.log("Receiving Cashu proofs...")
            await CocoManager.wallet.receive(data.proofs)
            console.log("✅ Cashu proofs received successfully")

            return {
                success: true,
                type: "cashu",
                amount: data.amount
            }

        } else {
            throw new Error("Unknown ecash type: " + data.type)
        }

    } catch (error) {
        console.error("Error receiving ecash:", error)
        throw error
    }
}