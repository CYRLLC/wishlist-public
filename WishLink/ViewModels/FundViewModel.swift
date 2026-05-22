import Foundation
import FirebaseFirestore

@MainActor
final class FundViewModel: ObservableObject {
    @Published var entries: [FundEntry] = []
    @Published var errorMessage: String?

    private var listener: ListenerRegistration?
    private let service = FirebaseService.shared

    var summary: FundSummary {
        FundSummary(totalAmount: entries.reduce(0) { $0 + $1.amount }, entries: entries)
    }

    func startListening(coupleId: String) {
        listener = service.listenFund(coupleId: coupleId) { [weak self] entries in
            self?.entries = entries
        }
    }

    func stopListening() { listener?.remove() }

    func addEntry(coupleId: String, userId: String, amount: Double, note: String) async {
        let entry = FundEntry(coupleId: coupleId, userId: userId, amount: amount, note: note)
        do { try await service.addFundEntry(entry) }
        catch { errorMessage = error.localizedDescription }
    }
}
