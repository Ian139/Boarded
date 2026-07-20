import XCTest
@testable import ClimbSet

final class HoldRadiusTests: XCTestCase {
    func testImagePointConversionIsScaleIndependent() {
        let atOne = EditorHoldGeometry.imagePoint(
            from: CGPoint(x: 240, y: 170),
            canvasSize: CGSize(width: 400, height: 300),
            zoomScale: 1,
            panOffset: .zero
        )
        let atTwo = EditorHoldGeometry.imagePoint(
            from: CGPoint(x: 280, y: 190),
            canvasSize: CGSize(width: 400, height: 300),
            zoomScale: 2,
            panOffset: .zero
        )
        XCTAssertEqual(atOne?.x, 240)
        XCTAssertEqual(atOne?.y, 170)
        XCTAssertEqual(atTwo?.x, 240)
        XCTAssertEqual(atTwo?.y, 170)
    }

    func testRadiusClampsToBounds() {
        XCTAssertEqual(EditorHoldGeometry.clampedRadius(1), 8)
        XCTAssertEqual(EditorHoldGeometry.clampedRadius(120), 96)
        XCTAssertEqual(EditorHoldGeometry.clampedRadius(32), 32)
    }

    func testNonFiniteRadiusCancels() {
        XCTAssertNil(EditorHoldGeometry.radius(from: CGPoint(x: 10, y: 10), to: CGPoint(x: CGFloat.infinity, y: 10)))
        XCTAssertNil(EditorHoldGeometry.clampedRadius(.nan))
    }

    func testRadiusKeepsCenterFixed() {
        let center = CGPoint(x: 20, y: 30)
        let finger = CGPoint(x: 50, y: 70)
        XCTAssertEqual(EditorHoldGeometry.radius(from: center, to: finger), 50)
    }
}
