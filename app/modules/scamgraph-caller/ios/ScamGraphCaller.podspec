require 'json'
package = JSON.parse(File.read(File.join(__dir__, '..', 'package.json')))

Pod::Spec.new do |s|
  s.name = 'ScamGraphCaller'
  s.version = package['version']
  s.summary = package['description']
  s.description = package['description']
  s.license = package['license']
  s.author = 'ScamGraph AI'
  s.homepage = 'https://scamgraph.example'
  s.platforms = { :ios => '15.1' }
  s.source = { :path => '.' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CallKit', 'Foundation', 'UIKit'
  s.source_files = 'ScamGraphCallerModule.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_VERSION' => '5.0' }
end
