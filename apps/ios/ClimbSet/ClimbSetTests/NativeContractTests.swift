import XCTest
@testable import ClimbSet
#if canImport(Supabase)
import Supabase
#endif
@MainActor
final class NativeContractTests: XCTestCase {
    func testLegacyRouteDecodingDefaultsOptionalFieldsAndFullRouteCarriesSnapshotDimensions() throws {
        let legacy = try decodeRoute(Self.routeJSON())
        XCTAssertEqual(legacy.gradeV, "V4")
        XCTAssertTrue(legacy.isPublic)
        XCTAssertEqual(legacy.viewCount, 0)
        XCTAssertNil(legacy.wallImageWidth)
        XCTAssertNil(legacy.wallImageHeight)
        XCTAssertEqual(legacy.ascents.count, 1)
        XCTAssertEqual(legacy.ascents[0].gradeV, "V0")

        let full = try decodeRoute(Self.routeJSON(extra: #"""
            ,"wall_image_width":1600,"wall_image_height":900,"like_count":4,"is_liked":true
            """#))
        XCTAssertEqual(full.wallImageWidth, 1600)
        XCTAssertEqual(full.wallImageHeight, 900)
        XCTAssertEqual(full.likeCount, 4)
        XCTAssertEqual(full.isLiked, true)

        let encoded = try JSONEncoder().encode(full)
        let object = try XCTUnwrap(JSONSerialization.jsonObject(with: encoded) as? [String: Any])
        XCTAssertEqual(object["wall_image_width"] as? Int, 1600)
        XCTAssertEqual(object["wall_image_height"] as? Int, 900)
    }

    func testFlexibleGradeAcceptsOnlyIntegralRankedNumbers() throws {
        for (wire, expected) in [("-1", "VB"), ("0", "V0"), ("17", "V17")] {
            let grade = try JSONDecoder().decode(FlexibleGrade.self, from: Data(wire.utf8))
            XCTAssertEqual(grade.value, expected, "wire value \(wire)")
        }
        for wire in ["1.5", "18", "-2"] {
            let grade = try JSONDecoder().decode(FlexibleGrade.self, from: Data(wire.utf8))
            XCTAssertNil(grade.value, "wire value \(wire) is unranked")
        }
        let stringGrade = try JSONDecoder().decode(FlexibleGrade.self, from: Data(#" " v7 " "#.replacingOccurrences(of: " ", with: "").utf8))
        XCTAssertEqual(stringGrade.value, "V7")
    }

    func testFallbackProjectionsPreserveSnapshotDimensionsAndAscents() throws {
        let data = Data(Self.routeJSON(extra: #"""
            ,"is_public":true,"view_count":0,"share_token":null,"user_name":"Climber","wall_image_width":1200,"wall_image_height":800
            """#).utf8)
        let withoutComments = try JSONDecoder().decode(RouteWithoutComments.self, from: data).asRoute()
        XCTAssertEqual(withoutComments.wallImageWidth, 1200)
        XCTAssertEqual(withoutComments.wallImageHeight, 800)
        XCTAssertEqual(withoutComments.ascents.count, 1)
        XCTAssertTrue(withoutComments.comments.isEmpty)

        let plain = try JSONDecoder().decode(RoutePlainRecord.self, from: data).asRoute()
        XCTAssertEqual(plain.wallImageWidth, 1200)
        XCTAssertEqual(plain.wallImageHeight, 800)
        XCTAssertTrue(plain.ascents.isEmpty)
        XCTAssertTrue(plain.comments.isEmpty)
    }

    func testMockRouteSnapshotPatchClearsURLAndDimensionsAtomically() async throws {
        let repository = MockRoutesRepository(fixture: true)
        let routes = try await repository.fetchRoutes(userId: nil)
        let route = try XCTUnwrap(routes.first)
        let updated = try await repository.updateRoute(
            id: route.id,
            patch: RoutePatch(
                wallSnapshot: RouteWallSnapshotPatch(wallId: "replacement-wall", wallImageUrl: nil, wallImageWidth: nil, wallImageHeight: nil),
                name: nil,
                gradeV: nil,
                holds: nil
            )
        )
        XCTAssertEqual(updated.wallId, "replacement-wall")
        XCTAssertNil(updated.wallImageUrl)
        XCTAssertNil(updated.wallImageWidth)
        XCTAssertNil(updated.wallImageHeight)
    }

    func testRouteDetailGeometryUsesOneAspectFitRectangleAndFallsBackForLegacyDimensions() {
        let container = CGRect(x: 0, y: 0, width: 400, height: 300)
        let fitted = RouteDetailGeometry.imageRect(imageWidth: 1000, imageHeight: 500, in: container)
        XCTAssertEqual(fitted, CGRect(x: 0, y: 50, width: 400, height: 200))
        let marker = CGPoint(x: fitted.minX + 0.25 * fitted.width, y: fitted.minY + 0.75 * fitted.height)
        XCTAssertEqual(marker, CGPoint(x: 100, y: 200))
        XCTAssertEqual(RouteDetailGeometry.imageRect(imageWidth: nil, imageHeight: nil, in: container), container)
        XCTAssertEqual(RouteDetailGeometry.imageRect(imageWidth: 0, imageHeight: 500, in: container), container)
    }

    func testEditorGeometryUsesModestInitialZoomForMismatchedAspectRatios() {
        let canvas = CGSize(width: 400, height: 300)
        let nearMatchingImage = EditorHoldGeometry.initialImageRect(
            imageAspectRatio: 1.2,
            in: canvas
        )
        XCTAssertEqual(nearMatchingImage.minX, 0, accuracy: 0.001)
        XCTAssertEqual(nearMatchingImage.width, 400, accuracy: 0.001)
        XCTAssertEqual(nearMatchingImage.height, 333.333, accuracy: 0.001)

        let extremePortraitImage = EditorHoldGeometry.initialImageRect(
            imageAspectRatio: 0.5,
            in: canvas
        )
        XCTAssertEqual(extremePortraitImage.width, 202.5, accuracy: 0.001)
        XCTAssertEqual(extremePortraitImage.height, 405, accuracy: 0.001)
        XCTAssertEqual(
            extremePortraitImage.height / 300,
            EditorHoldGeometry.maximumInitialImageScale,
            accuracy: 0.001
        )
    }

    func testWallUploadObjectPathUsesAuthenticatedOwnerPrefix() {
        let userID = UUID(uuidString: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA")!
        XCTAssertEqual(
            wallUploadObjectPath(userId: userID, wallId: "wall-1", fileName: "upload.jpg"),
            "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/wall-1/upload.jpg"
        )
    }

    func testConsolidatedGradeRanksAndCanonicalDisplay() {
        XCTAssertEqual(ProfileStatistics.gradeRank("VB"), 0)
        XCTAssertEqual(ProfileStatistics.gradeRank(" v17 "), 18)
        XCTAssertEqual(ProfileStatistics.gradeRank("V18"), -1)
        XCTAssertEqual(ProfileStatistics.displayGrade(setterGrade: "v0", ascentGrades: []), "V0")
        XCTAssertEqual(ProfileStatistics.displayGrade(setterGrade: "V0", ascentGrades: ["V2"]), "V1")
        XCTAssertNil(ProfileStatistics.displayGrade(setterGrade: "V18", ascentGrades: ["unknown"]))
    }

#if canImport(Supabase)
    func testRepositoryEnrichmentHandlesAbsentEqualAndDifferentSnapshotURLs() {
        let repository = SupabaseRoutesRepository(client: nil)
        let absent = repository.enrichRouteSnapshot(
            Self.makeRoute(imageURL: nil, width: nil, height: nil),
            wallImageById: ["wall": WallImageRecord(id: "wall", imageUrl: "https://cdn/wall.jpg", imageWidth: 1200, imageHeight: 800)]
        )
        XCTAssertEqual(absent.wallImageUrl, "https://cdn/wall.jpg")
        XCTAssertEqual(absent.wallImageWidth, 1200)
        XCTAssertEqual(absent.wallImageHeight, 800)

        let equal = repository.enrichRouteSnapshot(
            Self.makeRoute(imageURL: "  https://cdn/wall.jpg  ", width: nil, height: 700),
            wallImageById: ["wall": WallImageRecord(id: "wall", imageUrl: "https://cdn/wall.jpg", imageWidth: 1200, imageHeight: 800)]
        )
        XCTAssertEqual(equal.wallImageUrl, "  https://cdn/wall.jpg  ")
        XCTAssertEqual(equal.wallImageWidth, 1200)
        XCTAssertEqual(equal.wallImageHeight, 700)

        let different = repository.enrichRouteSnapshot(
            Self.makeRoute(imageURL: "https://historical/wall.jpg", width: nil, height: nil),
            wallImageById: ["wall": WallImageRecord(id: "wall", imageUrl: "https://cdn/wall.jpg", imageWidth: 1200, imageHeight: 800)]
        )
        XCTAssertEqual(different.wallImageUrl, "https://historical/wall.jpg")
        XCTAssertNil(different.wallImageWidth)
        XCTAssertNil(different.wallImageHeight)
    }

    func testSnapshotPatchPayloadDistinguishesAbsentFromExplicitNulls() throws {
        let absent = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(patchPayload(from: RoutePatch(wallSnapshot: nil, name: nil, gradeV: nil, holds: nil)))
        ) as? [String: Any]
        XCTAssertNil(absent?["wall_id"])
        XCTAssertNil(absent?["wall_image_url"])

        let clearing = try JSONSerialization.jsonObject(
            with: JSONEncoder().encode(patchPayload(from: RoutePatch(
                wallSnapshot: RouteWallSnapshotPatch(wallId: "wall-2", wallImageUrl: nil, wallImageWidth: nil, wallImageHeight: nil),
                name: nil,
                gradeV: nil,
                holds: nil
            )))
        ) as? [String: Any]
        XCTAssertEqual(clearing?["wall_id"] as? String, "wall-2")
        XCTAssertTrue(clearing?["wall_image_url"] is NSNull)
        XCTAssertTrue(clearing?["wall_image_width"] is NSNull)
        XCTAssertTrue(clearing?["wall_image_height"] is NSNull)
    }
#endif

    private func decodeRoute(_ json: String) throws -> Route {
        try JSONDecoder().decode(Route.self, from: Data(json.utf8))
    }

    private static func makeRoute(imageURL: String?, width: Int?, height: Int?) -> Route {
        Route(
            id: "route", userId: nil, wallId: "wall", name: "Route", description: nil,
            gradeV: "V1", gradeFont: nil, holds: [], isPublic: true, viewCount: 0,
            shareToken: nil, createdAt: "2026-01-01T00:00:00Z", updatedAt: "2026-01-01T00:00:00Z",
            userName: nil, wallImageUrl: imageURL, wallImageWidth: width, wallImageHeight: height,
            likeCount: nil, isLiked: nil, ascents: [], comments: []
        )
    }

    private static func routeJSON(extra: String = "") -> String {
        """
        {
          "id":"route-1","user_id":"user-1","wall_id":"wall-1","name":"Legacy Route",
          "description":null,"grade_v":"V4","grade_font":null,
          "holds":[{"id":"hold-1","x":20,"y":30,"type":"hand","color":"#FFFFFF","size":"medium","notes":null}],
          "created_at":"2026-01-01T00:00:00Z","updated_at":"2026-01-01T00:00:00Z",
          "wall_image_url":"https://cdn/wall.jpg",
          "ascents":[{"id":"ascent-1","route_id":"route-1","user_id":"user-1","user_name":"Climber","grade_v":0,"rating":null,"notes":null,"flashed":true,"created_at":"2026-01-02T00:00:00Z"}]\(extra)
        }
        """
    }
}
