import SwiftUI

struct WishCardView: View {
    let wish: Wish
    let isMyWish: Bool
    var onApprove: (() -> Void)?
    var onReject: (() -> Void)?
    var onDefer: (() -> Void)?
    var onRedeem: (() -> Void)?
    var currentPoints: Int = 0

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Header
            HStack {
                statusBadge
                Spacer()
                urgencyBadge
            }

            Text(wish.title)
                .font(.title3.bold())

            // 渴望程度
            HStack(spacing: 4) {
                ForEach(1...5, id: \.self) { i in
                    Image(systemName: i <= wish.desireLevel ? "heart.fill" : "heart")
                        .foregroundStyle(i <= wish.desireLevel ? .pink : .gray)
                        .font(.caption)
                }
            }

            if !wish.description.isEmpty {
                Text(wish.description)
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if !wish.persuasion.isEmpty {
                VStack(alignment: .leading, spacing: 4) {
                    Text("說服區")
                        .font(.caption.bold())
                        .foregroundStyle(.pink)
                    Text(wish.persuasion)
                        .font(.subheadline)
                        .italic()
                }
                .padding(10)
                .background(Color.pink.opacity(0.08))
                .clipShape(RoundedRectangle(cornerRadius: 8))
            }

            if let price = wish.estimatedPrice {
                Label("NT$ \(Int(price))", systemImage: "tag")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
            }

            if let urlStr = wish.purchaseURL, let url = URL(string: urlStr) {
                Link(destination: url) {
                    Label("查看商品", systemImage: "link")
                        .font(.caption)
                }
            }

            // 駁回原因
            if wish.status == .rejected, let reason = wish.rejectionReason {
                Label("駁回原因：\(reason)", systemImage: "xmark.circle")
                    .font(.caption)
                    .foregroundStyle(.red)
            }

            // 暫緩點數
            if wish.status == .deferred, let pts = wish.deferredPoints {
                HStack {
                    Label("需要 \(pts) 點才能兌換", systemImage: "star.fill")
                        .font(.caption)
                        .foregroundStyle(.orange)
                    Spacer()
                    if !isMyWish && currentPoints >= pts {
                        Button("立即兌換") { onRedeem?() }
                            .buttonStyle(.borderedProminent)
                            .tint(.orange)
                            .controlSize(.small)
                    } else if isMyWish {
                        Text("我的點數：\(currentPoints) / \(pts)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
            }

            // 對方審核操作
            if !isMyWish && wish.status == .pending {
                HStack(spacing: 12) {
                    Button { onReject?() } label: {
                        Label("駁回", systemImage: "xmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.red)

                    Button { onDefer?() } label: {
                        Label("暫緩", systemImage: "clock")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.bordered)
                    .tint(.orange)

                    Button { onApprove?() } label: {
                        Label("同意", systemImage: "checkmark")
                            .frame(maxWidth: .infinity)
                    }
                    .buttonStyle(.borderedProminent)
                    .tint(.green)
                }
            }
        }
        .padding()
        .background(Color(.systemBackground))
        .clipShape(RoundedRectangle(cornerRadius: 16))
        .shadow(color: .black.opacity(0.07), radius: 8, y: 2)
    }

    private var statusBadge: some View {
        let (text, color): (String, Color) = {
            switch wish.status {
            case .pending:   return ("待審核", .orange)
            case .approved:  return ("已承諾", .green)
            case .rejected:  return ("已駁回", .red)
            case .deferred:  return ("暫緩", .purple)
            case .redeemed:  return ("已兌換", .blue)
            case .completed: return ("已完成", .gray)
            }
        }()
        return Text(text)
            .font(.caption.bold())
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(color.opacity(0.15))
            .foregroundStyle(color)
            .clipShape(Capsule())
    }

    private var urgencyBadge: some View {
        Text(wish.urgency.label)
            .font(.caption)
            .padding(.horizontal, 8)
            .padding(.vertical, 3)
            .background(Color(.systemGray5))
            .clipShape(Capsule())
    }
}
