import XCTest

final class ClimbSetUITests: XCTestCase {
    private var app: XCUIApplication!

    override func setUpWithError() throws {
        continueAfterFailure = false
        XCUIDevice.shared.orientation = .portrait
        app = XCUIApplication()
        app.launchArguments = ["--climbset-ui-fixture"]
        app.launch()
    }

    override func tearDownWithError() throws {
        XCUIDevice.shared.orientation = .portrait
        app.terminate()
        app = nil
    }

    func testFixtureLaunchRoutesDetailAndSelectors() throws {
        XCTAssertTrue(app.staticTexts["Routes"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.staticTexts["Granite Drift"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Sort routes"].exists)
        XCTAssertTrue(app.buttons["Filter by grade"].exists)
        XCTAssertTrue(app.buttons["Filter by wall"].exists)

        app.staticTexts["Granite Drift"].tap()
        XCTAssertTrue(app.navigationBars["Route"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Close"].exists)
        app.buttons["Close"].tap()
        XCTAssertTrue(app.staticTexts["Routes"].waitForExistence(timeout: 5))

        let wallFilter = app.buttons["Filter by wall"]
        XCTAssertEqual(wallFilter.value as? String, "Fixture Slab")
        wallFilter.tap()
        XCTAssertTrue(app.buttons["All Walls"].waitForExistence(timeout: 3))
        app.buttons["All Walls"].tap()
        XCTAssertEqual(wallFilter.value as? String, "All Walls")

        let gradeFilter = app.buttons["Filter by grade"]
        gradeFilter.tap()
        XCTAssertTrue(app.buttons["V4"].waitForExistence(timeout: 3))
        app.buttons["V4"].tap()
        XCTAssertEqual(gradeFilter.value as? String, "V4")

        app.buttons["Sort routes"].tap()
        XCTAssertTrue(app.buttons["Sort: Name"].waitForExistence(timeout: 3))
        app.buttons["Sort: Name"].tap()
        XCTAssertEqual(app.buttons["Sort routes"].value as? String, "Sort: Name")
    }

    func testFixtureTabsProfileSettingsAppearanceAndOrientation() throws {
        XCTAssertTrue(app.staticTexts["Routes"].waitForExistence(timeout: 10))

        app.tabBars.buttons["Profile"].tap()
        app.buttons["Edit profile"].tap()
        XCTAssertTrue(app.navigationBars["Edit Profile"].waitForExistence(timeout: 3))
        let fullName = app.textFields["Full name"]
        XCTAssertTrue(fullName.waitForExistence(timeout: 3))
        fullName.tap()
        fullName.typeText(" Edited")
        app.buttons["Save"].tap()
        XCTAssertTrue(app.staticTexts["Fixture Climber Edited"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Settings"].exists)

        app.staticTexts["Settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Appearance"].exists)
        XCTAssertTrue(app.staticTexts["2 walls"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.buttons["Dark"].waitForExistence(timeout: 3))
        app.buttons["Dark"].tap()
        XCTAssertTrue(app.staticTexts["Dark mode is forced on"].waitForExistence(timeout: 3))

        XCUIDevice.shared.orientation = .landscapeLeft
        let window = app.windows.firstMatch
        XCTAssertTrue(window.waitForExistence(timeout: 3))
        XCTAssertGreaterThan(window.frame.width, window.frame.height)
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
        XCUIDevice.shared.orientation = .portrait
    }

    func testFixtureEditorWallAndHoldControlsAreDeterministic() throws {
        XCTAssertTrue(app.staticTexts["Routes"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Editor"].tap()
        XCTAssertTrue(app.staticTexts["Hold count"].waitForExistence(timeout: 10))
        XCTAssertTrue(app.buttons["Add Start hold"].exists)
        XCTAssertTrue(app.buttons["Add Hand hold"].exists)
    }
    func testFixtureWallCreateAndDeleteStayInMemory() throws {
        let name = "UI Fixture Wall \(UUID().uuidString)"
        XCTAssertTrue(app.staticTexts["Routes"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Profile"].tap()
        app.staticTexts["Settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
        app.buttons["Manage Walls"].tap()
        XCTAssertTrue(app.navigationBars["Select Wall"].waitForExistence(timeout: 5))

        let nameField = app.textFields["Wall name"]
        XCTAssertTrue(nameField.waitForExistence(timeout: 3))
        nameField.tap()
        nameField.typeText(name)
        if app.keyboards.firstMatch.exists {
            if app.keyboards.buttons["Done"].exists {
                app.keyboards.buttons["Done"].tap()
            } else {
                app.keyboards.buttons["Return"].tap()
            }
        }
        app.buttons["Add Wall"].tap()
        XCTAssertTrue(app.staticTexts[name].waitForExistence(timeout: 5))
        XCTAssertEqual(app.buttons[name].value as? String, "Selected")
        let renamed = "\(name) Renamed"
        let createdWall = app.buttons[name]
        createdWall.swipeLeft()
        XCTAssertTrue(app.buttons["Edit"].waitForExistence(timeout: 3))
        app.buttons["Edit"].tap()
        XCTAssertTrue(app.navigationBars["Edit Wall"].waitForExistence(timeout: 5))
        let editNameField = app.textFields["Edit wall name"]
        XCTAssertTrue(editNameField.waitForExistence(timeout: 3))
        editNameField.tap()
        editNameField.press(forDuration: 1.0)
        let selectAll = app.menuItems["Select All"]
        XCTAssertTrue(selectAll.waitForExistence(timeout: 3))
        selectAll.tap()
        editNameField.typeText(renamed)
        app.buttons["Save"].tap()
        XCTAssertTrue(app.navigationBars["Edit Wall"].waitForNonExistence(timeout: 5))
        let renamedWall = app.buttons[renamed]
        XCTAssertTrue(renamedWall.waitForExistence(timeout: 15))
        XCTAssertFalse(app.buttons[name].exists)
        renamedWall.swipeLeft()
        XCTAssertTrue(app.buttons["Delete"].waitForExistence(timeout: 3))
        app.buttons["Delete"].tap()
        XCTAssertTrue(renamedWall.waitForNonExistence(timeout: 5))
    }
    func testFixtureEditorHoldGesturesAndRouteCreate() throws {
        let routeName = "UI Fixture Route \(UUID().uuidString)"
        XCTAssertTrue(app.staticTexts["Routes"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Editor"].tap()
        let canvas = app.otherElements["Editor canvas surface"]
        XCTAssertTrue(canvas.waitForExistence(timeout: 10))
        let addStart = app.buttons["Add Start hold"]
        XCTAssertTrue(addStart.waitForExistence(timeout: 5))
        let addStartEnabled = expectation(
            for: NSPredicate(format: "enabled == true"),
            evaluatedWith: addStart
        )
        wait(for: [addStartEnabled], timeout: 5)
        app.buttons["Add Start hold"].tap()
        canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.35, dy: 0.5)).tap()
        XCTAssertTrue((canvas.value as? String)?.contains("1 hold") == true)

        app.buttons["Add Hand hold"].tap()
        canvas.coordinate(withNormalizedOffset: CGVector(dx: 0.65, dy: 0.5)).tap()
        XCTAssertTrue((canvas.value as? String)?.contains("2 holds") == true)

        let firstMarker = app.descendants(matching: .any)["Editor hold 1"]
        let secondMarker = app.descendants(matching: .any)["Editor hold 2"]
        XCTAssertTrue(firstMarker.waitForExistence(timeout: 5))
        XCTAssertTrue(secondMarker.waitForExistence(timeout: 5))
        XCTAssertTrue((firstMarker.value as? String)?.contains("percent x") == true)

        func radius(from value: String?) -> Int? {
            guard let value,
                  let component = value.split(separator: ",").last,
                  let number = component.split(separator: " ").first else {
                return nil
            }
            return Int(number)
        }
        func position(from value: String?) -> (x: Int, y: Int)? {
            guard let value else { return nil }
            let components = value.split(separator: ",")
            guard components.count >= 2,
                  let x = Int(components[0].split(separator: " ").first ?? ""),
                  let y = Int(components[1].split(separator: " ").first ?? "") else {
                return nil
            }
            return (x, y)
        }

        guard let firstInitialRadius = radius(from: firstMarker.value as? String),
              let secondInitialRadius = radius(from: secondMarker.value as? String) else {
            return XCTFail("Both holds must expose their initial radii.")
        }

        guard let firstPositionBeforeEdit = position(from: firstMarker.value as? String),
              let secondPositionBeforeEdit = position(from: secondMarker.value as? String) else {
            return XCTFail("Both holds must expose their positions.")
        }

        firstMarker.tap()
        XCTAssertTrue(firstMarker.label.localizedCaseInsensitiveContains("selected"))
        let resizeStart = firstMarker.coordinate(withNormalizedOffset: CGVector(dx: 0.5, dy: 0.5))
        resizeStart.press(forDuration: 0.5, thenDragTo: resizeStart.withOffset(CGVector(dx: 80, dy: 0)))
        guard let firstLongPressRadius = radius(from: firstMarker.value as? String) else {
            return XCTFail("The long-press resize must expose a radius.")
        }
        XCTAssertGreaterThan(firstLongPressRadius, firstInitialRadius)
        firstMarker.pinch(withScale: 1.6, velocity: 1.0)
        guard let firstResizedRadius = radius(from: firstMarker.value as? String),
              let secondAfterEditRadius = radius(from: secondMarker.value as? String) else {
            return XCTFail("Both holds must expose their radii after the edit pinch.")
        }
        XCTAssertGreaterThan(firstResizedRadius, firstLongPressRadius)
        XCTAssertEqual(secondAfterEditRadius, secondInitialRadius)
        guard let firstPositionAfterEdit = position(from: firstMarker.value as? String),
              let secondPositionAfterEdit = position(from: secondMarker.value as? String) else {
            return XCTFail("Both holds must expose their positions after the edit pinch.")
        }
        XCTAssertEqual(firstPositionAfterEdit.x, firstPositionBeforeEdit.x)
        XCTAssertEqual(firstPositionAfterEdit.y, firstPositionBeforeEdit.y)
        XCTAssertEqual(secondPositionAfterEdit.x, secondPositionBeforeEdit.x)
        XCTAssertEqual(secondPositionAfterEdit.y, secondPositionBeforeEdit.y)

        app.buttons["Save"].tap()
        let routeNameField = app.textFields["Route name"]
        XCTAssertTrue(routeNameField.waitForExistence(timeout: 3))
        routeNameField.tap()
        routeNameField.typeText(routeName)
        app.buttons.matching(identifier: "Save").element(boundBy: 1).tap()
        XCTAssertTrue(app.tabBars.buttons["Routes"].waitForExistence(timeout: 5))
        app.tabBars.buttons["Routes"].tap()
        XCTAssertTrue(app.staticTexts[routeName].waitForExistence(timeout: 10))
        app.staticTexts[routeName].tap()
        XCTAssertTrue(app.navigationBars["Route"].waitForExistence(timeout: 5))
        app.buttons["Edit"].tap()
        let persistedFirstMarker = app.descendants(matching: .any)["Editor hold 1"]
        let persistedSecondMarker = app.descendants(matching: .any)["Editor hold 2"]
        XCTAssertTrue(persistedFirstMarker.waitForExistence(timeout: 5))
        XCTAssertTrue(persistedSecondMarker.waitForExistence(timeout: 5))
        XCTAssertEqual(radius(from: persistedFirstMarker.value as? String), firstResizedRadius)
        XCTAssertEqual(radius(from: persistedSecondMarker.value as? String), secondAfterEditRadius)
        guard let persistedFirstPosition = position(from: persistedFirstMarker.value as? String),
              let persistedSecondPosition = position(from: persistedSecondMarker.value as? String) else {
            return XCTFail("Both persisted holds must expose their positions.")
        }
        XCTAssertEqual(persistedFirstPosition.x, firstPositionAfterEdit.x)
        XCTAssertEqual(persistedFirstPosition.y, firstPositionAfterEdit.y)
        XCTAssertEqual(persistedSecondPosition.x, secondPositionAfterEdit.x)
        XCTAssertEqual(persistedSecondPosition.y, secondPositionAfterEdit.y)
    }

    func testFixtureRouteReadUpdateReopenAndDelete() throws {
        let updatedName = "Granite Drift Updated"
        XCTAssertTrue(app.staticTexts["Routes"].waitForExistence(timeout: 10))
        app.staticTexts["Granite Drift"].tap()
        XCTAssertTrue(app.navigationBars["Route"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Granite Drift"].exists)
        app.buttons["Edit"].tap()
        let editorSave = app.buttons["Save"]
        XCTAssertTrue(editorSave.waitForExistence(timeout: 5))
        let editorSaveEnabled = expectation(
            for: NSPredicate(format: "enabled == true"),
            evaluatedWith: editorSave
        )
        wait(for: [editorSaveEnabled], timeout: 5)
        editorSave.tap()
        let routeNameField = app.textFields["Route name"]
        XCTAssertTrue(routeNameField.waitForExistence(timeout: 3))
        routeNameField.tap()
        routeNameField.typeText(" Updated")
        app.buttons.matching(identifier: "Save").element(boundBy: 1).tap()
        XCTAssertTrue(app.staticTexts[updatedName].waitForExistence(timeout: 8))
        app.staticTexts[updatedName].tap()
        XCTAssertTrue(app.navigationBars["Route"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts[updatedName].exists)
        app.buttons["Delete"].tap()
        XCTAssertTrue(app.buttons["Delete Route"].waitForExistence(timeout: 3))
        app.buttons["Delete Route"].tap()
        XCTAssertTrue(app.staticTexts[updatedName].waitForNonExistence(timeout: 8))
    }
    func testFixtureLogoutAndSignInStayLocal() throws {
        XCTAssertTrue(app.staticTexts["Routes"].waitForExistence(timeout: 10))
        app.tabBars.buttons["Profile"].tap()
        app.staticTexts["Settings"].tap()
        XCTAssertTrue(app.navigationBars["Settings"].waitForExistence(timeout: 5))
        app.staticTexts["Account Access"].tap()
        XCTAssertTrue(app.navigationBars["Account"].waitForExistence(timeout: 5))
        let logOut = app.buttons["Log Out"]
        XCTAssertTrue(logOut.waitForExistence(timeout: 3))
        logOut.tap()
        XCTAssertTrue(app.staticTexts["Welcome back"].waitForExistence(timeout: 5))

        let email = app.textFields["you@example.com"]
        let password = app.secureTextFields["password"]
        email.tap()
        email.typeText("fixture@climbset.test")
        password.tap()
        password.typeText("fixture-password")
        app.buttons["Log In"].tap()
        XCTAssertTrue(app.navigationBars["Account"].waitForExistence(timeout: 5))
        XCTAssertTrue(app.staticTexts["Fixture Climber"].waitForExistence(timeout: 5))
    }
}
