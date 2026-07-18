//
//  ClimbSetApp.swift
//  ClimbSet
//
//  Created by Ian Rapko on 3/5/26.
//

import SwiftUI
#if canImport(UIKit)
import UIKit
#endif

@main
struct ClimbSetApp: App {
    init() {
        #if canImport(UIKit)
        let tabAppearance = UITabBarAppearance()
        tabAppearance.configureWithOpaqueBackground()
        tabAppearance.backgroundColor = UIColor { traits in
            traits.userInterfaceStyle == .dark
                ? UIColor.fromHex("#0b0905")
                : UIColor.fromHex("#f8f5ee")
        }
        tabAppearance.shadowColor = .clear
        UITabBar.appearance().standardAppearance = tabAppearance
        UITabBar.appearance().scrollEdgeAppearance = tabAppearance

        let navAppearance = UINavigationBarAppearance()
        navAppearance.configureWithOpaqueBackground()
        navAppearance.backgroundColor = tabAppearance.backgroundColor
        navAppearance.shadowColor = .clear
        navAppearance.titleTextAttributes = [
            .foregroundColor: UIColor { traits in
                traits.userInterfaceStyle == .dark
                    ? UIColor.fromHex("#f5f1ea")
                    : UIColor.fromHex("#2d1e14")
            }
        ]
        UINavigationBar.appearance().standardAppearance = navAppearance
        UINavigationBar.appearance().scrollEdgeAppearance = navAppearance
        #endif
    }

    var body: some Scene {
        WindowGroup {
            RootView()
        }
    }
}
