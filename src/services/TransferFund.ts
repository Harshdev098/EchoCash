import type { Wallet } from "@fedimint/core-web"
import type { Manager } from "coco-cashu-core"

export const TransferFunds = async(activeTab:boolean,Fedimintwallet:Wallet | null,CocoManager:Manager | null,socket:WebSocket | null,persistentUserId:string,transferAmount:number,selectedPeerId:string) => {
    if (!activeTab) {
        const result = await Fedimintwallet?.mint.spendNotes(transferAmount * 1000)
        console.log("the transfer result is ", result)
        let message = JSON.stringify({
            notes: result?.notes,
            type: "fedimint",
            amount: transferAmount * 1000
        })
        socket?.send(
            JSON.stringify({
                type: 'message',
                to: selectedPeerId,
                from: persistentUserId,
                content: message,
            })
        )
        alert("Sent!");
    } else {
        const mintURL = localStorage.getItem("trustedMint");
        if (!mintURL) throw new Error("No mint selected");

        const result = await CocoManager?.wallet.send(mintURL, transferAmount);
        console.log("the transfer result is", result)
        let message = JSON.stringify({
            notes: result?.proofs,
            type: "cashu",
            amount: transferAmount * 1000,
        })
        socket?.send(
            JSON.stringify({
                type: 'message',
                to: selectedPeerId,
                from: persistentUserId,
                content: message,
            })
        )
        alert("Sent!");
    }
}